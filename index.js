const express = require('express');
const request = require('request-promise');
const mysql = require('promise-mysql');
const moment = require('moment');
const bodyParser = require('body-parser');
const multiparty = require('multiparty');
const fs = require('fs');
const app = express();

const remoteFileUrl = '../SE_Booking_System_front/dist';

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, GET, PUT");
    res.header("Access-Control-Allow-Headers", 'Authorization, CONTENT-TYPE');
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    next();
});

app.use(bodyParser.json());

mysql.createConnection({
    host: 'localhost',
    user: 'booking',
    password: 'csebooking330',
    database: 'booking_system'
}).then((conn) => {
    // 로그인
    app.post('/login', (req, res) => {
        const auth = new Buffer(req.headers.authorization.split('Bearer ')[1], 'base64') + '';
        const id = auth.split(':')[0];
        const password = auth.split(':')[1];

        let query = `SELECT booking.booker, booking.booking_date, booking.booking_time, suspect_list.start_date, suspect_list.end_date FROM
                            booking,
                            (SELECT * FROM booking_system.report WHERE (start_date <= ${ mysql.escape(moment().format('YYYY-MM-DD')) } AND ${ mysql.escape(moment().format('YYYY-MM-DD')) } <= end_date)) AS suspect_list
                        WHERE
                            suspect_list.prebooker = booking.id AND
                            booking.booker = ${ mysql.escape(id) }
                        ORDER BY suspect_list.id DESC`;
        conn.query(query).then(rows => {
            if (rows.length !== 0) {
                res.send({
                    status: 'success',
                    result: 'login fail',
                    suspect: rows[0]
                });
            } else {
                let encodedPassword = encodeURIComponent(password);
                const url = `http://kumohweb.kumoh.ac.kr/mybsvr/login/login.jsp?id=${id}&passwd=${ encodedPassword }`;

                const expressRes = res;
                request(url).then(res => {
                    if (res.match('OK')) {
                        // 로그인 성공시 admin 체크 수행
                        const query = `SELECT * FROM admin WHERE credit = ${ mysql.escape(id) }`;
                        conn.query(query).then(rows => {
                            if (rows.length !== 0) {
                                expressRes.send({
                                    status: 'success',
                                    result: 'login success',
                                    isAdmin: true
                                })
                            } else {
                                expressRes.send({
                                    status: 'success',
                                    result: 'login success',
                                    isAdmin: false
                                })
                            }
                        });
                    } else {
                        expressRes.send({
                            status: 'success',
                            result: 'login fail'
                        })
                    }
                }).catch(error => {
                    expressRes.send({
                        status: 'fail',
                        result: error
                    })
                });
            }

        }).catch(err => {
            res.send({
                status: 'fail',
                result: err
            })
        });
    });
    // 전체 예약 현황
    app.get('/booking', (req, res) => {
        let query =
            `SELECT booking.id, booking.booker, booking.booking_date, booking.booking_time, booking.changer, section.name AS section, booking.isdelete FROM 
                booking, section 
                WHERE 
                    booking.isdelete = 0 AND
                    booking.section = section.id`;
        conn.query(query).then(rows => {
            res.send({
                status: 'success',
                result: rows
            })
        }).catch(err => {
            res.send({
                status: 'fail',
                result: err
            });
        });
    });
    // 예약 현황 By Id
    app.get('/booking/:id', (req, res) => {
        let query =
            `SELECT booking.id, booking.booker, booking.booking_date, booking.booking_time, booking.changer, section.name AS section, booking.isdelete FROM 
                booking, section 
                WHERE 
                    booking.isdelete = 0 AND
                    booking.id = ${ mysql.escape(req.params.id) } AND
                    booking.section = section.id`;
        conn.query(query).then(rows => {
            res.send({
                status: 'success',
                result: rows
            })
        }).catch(err => {
            res.send({
                status: 'fail',
                result: err
            });
        });
    });
    // 메인화면 예약 현황
    app.get('/booking-info', (req, res) => {
        let query = '';
        if (req.query.date_flag === 'today') {
            query = `SELECT booking.id as id, booker, booking_time, section.name as section
                    FROM section, booking
                    WHERE
                        booking_date = ${ mysql.escape(moment().format('YYYY-MM-DD')) } AND
                        booking.isdelete = 0 AND
                        section.id = booking.section`;
        } else if (req.query.date_flag === 'tomorrow') {
            query =
                `SELECT booking.id as id, booker, booking_time, section.name as section
                    FROM section, booking
                    WHERE
                        booking_date = ${ mysql.escape(moment().add(1, 'd').format('YYYY-MM-DD')) } AND
                        booking.isdelete = 0 AND
                        section.id = booking.section`;
        }
        conn.query(query).then(rows => {
            res.send({
                status: 'success',
                result: rows
            });
        }).catch(err => {
            res.send({
                status: "fail",
                result: err
            })
        });
    });
    // 섹션 리스트
    app.get('/section', (req, res) => {
        const query = `SELECT id, name FROM section WHERE isdelete = 0`;
        conn.query(query).then(rows => {
            res.send({
                status: 'success',
                result: rows
            })
        }).catch(err => {
            res.send({
                status: 'fail',
                result: err
            })
        })
    });
    // 예약
    app.post('/book', (req, res) => {
        const data = req.body;
        let query = `SELECT * FROM booking WHERE booking_date = ${mysql.escape(data.booking_date)} AND section = ${mysql.escape(data.section)} AND isdelete = 0`;
        conn.query(query).then(rows => { // 입력받은 예약정보의 날짜, 섹션에 해당하는 예약 정보 호출
            let canInsert = true;
            let bookingTime = data.booking_time.split(', ');
            for (let i = 0; i < rows.length; i++) { // 입력받은 예약정보의 예약 시간과 1시간이라도 겹치는 row가 발견되면 INSERT 하지 않음.
                if (!canInsert) break; // insert를 하지 못하면 loop 종료
                let bookedTime = rows[i].booking_time.split(', ');
                for (let j = 0; j < bookedTime.length; j++) {
                    if (bookingTime.indexOf(bookedTime[j]) !== -1) { // 겹치는 시간이 존재한다는 뜻
                        canInsert = false; // insert 하지못함
                        break;
                    }
                }
            }

            if (canInsert) { // 위의 확인 과정을 거쳐서 insert를 할 수 있다고 하면 Insert를 진행함.
                let query = `INSERT INTO booking (booker, booking_time, booking_date, section) VALUES (${mysql.escape(data.booker)}, ${mysql.escape(data.booking_time)}, ${mysql.escape(data.booking_date)}, ${mysql.escape(data.section)})`;
                conn.query(query).then(result => {
                    res.send({
                        status: 'success',
                        result: 'insert success'
                    });
                }).catch(error => {
                    res.send({
                        status: 'fail',
                        result: error
                    });
                });
            } else {
                res.send({
                    status: 'success',
                    result: 'insert fail, exist same booking_time'
                });
            }
        });
    });
    // 마이페이지용 예약 현황
    app.get('/mypage', (req, res) => {
        let id = req.query.id; // 마이페이지에 접속한 학번
        let query = `SELECT 	
                        booking.id as id,
                        booking.booker as booker, 
                        booking.booking_date as booking_date,
                        booking.booking_time as booking_time,
                        section.name as section
                        FROM 
                            booking, section
                        WHERE
                            section.id = booking.section AND
                            booking.booker = ${mysql.escape(id)} AND
                            (booking.booking_date = ${mysql.escape(moment().subtract(1, 'd').format('YYYY-MM-DD'))} OR
                             booking.booking_date = ${mysql.escape(moment().format('YYYY-MM-DD'))} OR
                             booking.booking_date = ${mysql.escape(moment().add(1, 'd').format('YYYY-MM-DD'))}) AND
                            booking.isdelete = 0    
	                    ORDER BY booking.id DESC`;
        conn.query(query).then(rows => {
            res.send({
                status: 'success',
                result: rows
            });
        }).catch(err => {
            res.send({
                status: 'fail',
                result: err
            });
        });
    });
    // 예약 취소
    app.put('/cancle-book', (req, res) => {
        let booking_id = req.body.booking_id; // 예약 id
        let changer_id = req.body.changer_id; // 변경자 id
        let query = `UPDATE booking SET booking.changer = ${mysql.escape(changer_id)}, booking.isdelete = 1 WHERE booking.id = ${mysql.escape(booking_id)}`;
        conn.query(query).then(result => {
            res.send({
                status: 'success',
                result: 'Booking info was deleted successfully'
            });
        }).catch(err => {
            res.send({
                status: 'fail',
                result: err
            });
        })
    });
    // 사용 종료
    app.put('/end-book', (req, res) => {
        let booking_id = req.body.booking_id; // 예약 id
        let changer_id = req.body.changer_id; // 변경자 학번
        let change_time = req.body.change_time; // 변경된 시간 // '12, 13, 14' => '12, 14'

        let query = `UPDATE booking
                        SET 
                            booking.changer = ${mysql.escape(changer_id)},
                            booking.booking_time = ${mysql.escape(change_time)}
                        WHERE
                            booking.id = ${mysql.escape(booking_id)}`;

        conn.query(query).then(() => {
            res.send({
                status: 'success',
                result: 'Booking was end successfully'
            });
        }).catch(err => {
            res.send({
                status: 'fail',
                result: err
            });
        });
    });
    // 신고
    app.post('/report', (req, res) => {
        const data = new multiparty.Form();
        let title, contents, time;
        data.on('field', (name, value) => {
            if (name === 'title') {
                title = value;
            } else if (name === 'contents') {
                contents = value;
            } else if (name === 'time') {
                time = value;
            }
        });

        let fileUrlList = [];
        data.on('part', (file) => {
            let url = remoteFileUrl + '/assets/report/' + moment() + file.filename;
            const fileWriteStream = fs.createWriteStream(url);
            file.pipe(fileWriteStream);

            file.on('end', () => {
                fileUrlList.push(url);
                fileWriteStream.end();
            });
        });
        data.on('close', () => {
            let query = // reporter는 신고자의 예약번호, target은 용의자의 예약번호.
                `SELECT reporter.booker as reporter, target.id as suspect FROM
                            booking AS reporter,
                            booking AS target
                            WHERE
                                target.id = ${ mysql.escape(time) } AND
                                target.section = reporter.section AND
                                target.id > reporter.id
                            ORDER BY reporter.id DESC`;

            conn.query(query).then(rows => { // 신고자에 대한 용의자의 예약 번호를 찾아오고 report 테이블에 INSERT 할 준비를 함.
                let reporter = rows[0].reporter;
                let suspect = rows[0].suspect;
                let query = `INSERT INTO report (reporter, title, content, prebooker) VALUES (${ mysql.escape(reporter) }, ${ mysql.escape(title) }, ${ mysql.escape(contents) }, ${ mysql.escape(suspect)})`;
                conn.query(query).then(result => { // report 테이블에 INSERT 한 ID를 가져다 reportpicture 테이블에 외래키로 넣을 준비를 함.
                    for (let i = 0; i < fileUrlList.length; i++) { // file 갯수만큼 루프를 돌면서 reportpicture 테이블에 INSERT
                        let frontUrl = '../booking_system' + fileUrlList[i].split(remoteFileUrl)[1];
                        let query = `INSERT INTO reportpicture (report_id, url) VALUES (${ mysql.escape(result.insertId) }, ${ mysql.escape(frontUrl) })`;
                        conn.query(query).then(result => {
                            res.send({
                                status: 'success',
                                result: 'Report was posted successfully'
                            });
                        }).catch(err => {
                            res.send({
                                status: 'fail',
                                result: err
                            });
                        });
                    }
                }).catch(err => {
                    res.send({
                        status: 'fail',
                        result: err
                    })
                });
            }).catch(err => {
                res.send({
                    status: 'fail',
                    result: err
                });
            });

        });
        data.parse(req);
    });
    // 배치도 첨부
    app.post('/layout', (req, res) => {
        const data = new multiparty.Form();
        data.on('part', (file) => {
            let url = remoteFileUrl + '/assets/layout/' + moment() + file.filename;
            const fileWriteStream = fs.createWriteStream(url);
            file.pipe(fileWriteStream);

            file.on('end', () => {
                fileWriteStream.end();
                let frontUrl = '../booking_system' + url.split(remoteFileUrl)[1];
                let query = `UPDATE layout SET isdelete = 1 WHERE isdelete = 0`;
                conn.query(query).then(() => {
                    let query = `INSERT INTO layout (url) VALUES (${ mysql.escape(frontUrl) })`;
                    conn.query(query).then(() => {
                        res.send({
                            status: 'success',
                            result: 'Layout was insert successfully.'
                        })
                    }).catch(err => {
                        res.send({
                            status: 'fail',
                            result: err
                        });
                    });
                }).catch(err => {
                    res.send({
                        status: 'fail',
                        result: err
                    });
                });
            });
        });
        data.parse(req);
    });
    // 배치도 로드
    app.get('/layout', (req, res) => {
        let query = `SELECT url FROM layout WHERE isdelete = 0 ORDER BY id DESC`;
        conn.query(query).then(rows => {
            res.send({
                status: 'success',
                result: rows[0] // 최신의 layout 파일 url
            });
        }).catch(err => {
            res.send({
                status: 'fail',
                result: err
            });
        })
    });
    // 관리자 리스트
    app.get('/admin', (req, res) => {
        const query = 'SELECT id, credit, name, position FROM admin WHERE isdelete = 0';
        conn.query(query).then(rows => {
            res.send({
                status: 'success',
                result: rows
            });
        }).catch(err => {
            res.send({
                status: 'fail',
                result: err
            });
        });
    });
    // 관리자 정보 By 학번
    app.get('/admin/:credit', (req, res) => {
        let query = `SELECT * FROM admin WHERE credit = ${ mysql.escape(req.params.credit) } AND isdelete = 0 ORDER BY id DESC`;
        conn.query(query).then(rows => {
            res.send({
                status: 'success',
                result: rows
            })
        }).catch(err => {
            res.send({
                status: 'fail',
                result: err
            })
        });
    });
    // 관리자 추가
    app.post('/post-admin', (req, res) => {
        const data = req.body;
        let query = `SELECT * FROM admin
                    WHERE
                        credit = ${mysql.escape(data.credit)} AND
                        name = ${mysql.escape(data.name)} AND
                        isdelete = 0`;

        conn.query(query).then(rows => {
            let canInsert = true;
            let credit = data.credit;
            let name = data.name;

            for (let i = 0; i < rows.length; i++) {// 입력받은 정보와 같은 학번이나 이름을 가진 row가 발견될 경우 INSERT 하지 않음
                if (!canInsert) break;// INSERT 못할 시 loop 종료

                let adminCredit = rows[i].credit;
                let adminName = rows[i].name;

                if (credit === adminCredit && name === adminName) {// 겹치는 사람이 존재한다는 뜻
                    canInsert = false;
                }
            }

            if (canInsert) {// 확인 후 INSERT할 수 있다고 하면 INSERT진행
                let query = `INSERT INTO admin (credit, name, position)
                            VALUES (${mysql.escape(data.credit)}, ${mysql.escape(data.name)}, ${mysql.escape(data.position)})`;
                conn.query(query).then(rows => {
                    res.send({
                        status: 'success',
                        result: rows
                    });
                }).catch(err => {
                    res.send({
                        status: 'fail',
                        result: err
                    });
                });
            }
        });
    });
    // 관리자 제거
    app.put('/delete-admin', (req, res) => {
        const data = req.body;
        let id = data.id;
        let query = 'UPDATE admin SET isdelete = 1 WHERE id = ' + id;

        conn.query(query).then(rows => {
            res.send({
                status: 'success',
                result: rows
            });
        }).catch(err => {
            res.send({
                status: 'fail',
                result: err
            });
        });
    });
    // 섹션 추가
    app.post('/post-section', (req, res) => {
        const data = req.body;
        let query = `SELECT name FROM section
                    WHERE
                        name = ${mysql.escape(data.name)} AND
                        isdelete = 0`;

        conn.query(query).then(rows => {// 입력받은 정보와 같은 이름의 row가 발견되면 INSERT하지 않음
            let canInsert = true;
            let name = data.name;

            for (let i = 0; i < rows.length; i++) {
                if (!canInsert) break;

                let section = rows[i].name;
                if (section === name) {
                    canInsert = false;
                }
            }

            if (canInsert) {
                let query = `INSERT INTO section (name)
                        VALUES (${mysql.escape(data.name)})`;
                conn.query(query).then(rows => {
                    res.send({
                        status: 'success',
                        result: rows
                    });
                }).catch(err => {
                    res.send({
                        status: 'fail',
                        result: err
                    });
                });
            }
        });
    });
    // 섹션 삭제
    app.put('/delete-section', (req, res) => {
        const data = req.body;
        let id = data.id;
        let query = `UPDATE section SET isdelete = 1 WHERE id = ` + id;

        conn.query(query).then(rows => {
            res.send({
                status: 'success',
                result: rows
            });
        }).catch(err => {
            res.send({
                status: 'fail',
                result: err
            });
        });
    });
    // 제재 리스트
    app.get('/sanction', (req, res) => {// 제재 대상, 처리자, 처리결과, 처리일자를 받아 제재 리스트를 작성
        const query = `SELECT 
                            booking.booker AS prebooker,
                            admin.name AS manager,
                            result,
                            start_date,
                            end_date
                        FROM
                            report,
                            booking,
                            admin
                        WHERE
                            report.manager = admin.id
                            AND report.prebooker = booking.id
                            AND result IS NOT NULL
                            AND start_date IS NOT NULL
                            AND end_date IS NOT NULL
                        ORDER BY
                            report.id DESC`;

        conn.query(query).then(rows => {
            res.send({
                status: 'success',
                result: rows
            });
        }).catch(err => {
            res.send({
                status: 'fail',
                result: err
            });
        });
    });
    // 제재 추가
    app.put('/post-sanction', (req, res) => {
        const data = req.body;
        let query = `SELECT id FROM report
                        WHERE
                            id = ${mysql.escape(data.id)} AND
                            manager IS NULL AND
                            result IS NULL AND
                            start_date IS NULL AND
                            end_date IS NULL`;

        conn.query(query).then(rows => {
            if (rows.length !== 0) {
                let query = `UPDATE report
                                SET
                                    manager = ${mysql.escape(data.manager)},
                                    result = ${mysql.escape(data.result)},
                                    start_date = ${mysql.escape(data.start_date)},
                                    end_date = ${mysql.escape(data.end_date)}
                                WHERE id = ${mysql.escape(data.id)}`;

                conn.query(query).then(rows => {
                    res.send({
                        status: 'success',
                        result: 'Sanction was updated successfully'
                    });
                }).catch(err => {
                    res.send({
                        status: 'fail',
                        result: err
                    });
                });
            } else {
                res.send({
                    status: 'fail',
                    result: `Not Exist ${data.id} Report`
                })
            }
        });
    });
    // 신고 리스트
    app.get('/report', (req, res) => {
        let query =
            `SELECT r.id, r.title, b.booker, b.booking_date, b.section  FROM
		        (SELECT report.id AS id, report.title AS title, report.prebooker AS prebooker
			        FROM report WHERE manager IS NULL) AS r,
		        (SELECT booking.id AS id, booking.booker AS booker, booking.booking_date AS booking_date, section.name AS section
			        FROM booking, section
                    WHERE booking.section = section.id) AS b
                WHERE r.prebooker = b.id;`;

        conn.query(query).then(rows => {
            res.send({
                status: 'success',
                result: rows
            });
        }).catch(err => {
            res.send({
                status: 'fail',
                result: err
            });
        });
    });
    // 신고 내용
    app.get('/report/:id', (req, res) => {
        let query =
            `SELECT r.id, r.title, r.content, r.url, b.booker AS prebooker  FROM
                (SELECT report.id AS id, report.title AS title, report.content AS content, report.prebooker AS prebooker, reportpicture.url AS url 
                    FROM report, reportpicture
                    WHERE report.id = reportpicture.report_id AND report.id = ${ mysql.escape(req.params.id) }) AS r,
                (SELECT booking.id AS id, booking.booker AS booker, booking.booking_date AS booking_date, section.name AS section
                    FROM booking, section
                    WHERE booking.section = section.id) AS b
                WHERE
                    r.prebooker = b.id`;

        conn.query(query).then(rows => {
            res.send({
                status: 'success',
                result: rows
            })
        }).catch(err => {
            res.send({
                status: 'fail',
                result: err
            })
        })
    });
});

app.listen(3000, () => {
    console.log('Server open in 3000 port');
});
