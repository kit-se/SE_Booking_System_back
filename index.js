const express = require('express');
const request = require('request-promise');
const mysql = require('promise-mysql');
const moment = require('moment');
const bodyParser = require('body-parser');
const multiparty = require('multiparty');
const fs = require('fs');
const app = express();

const localFileUrl = '../front/src';
const remoteFileUrl = '../SE_Booking_System_front/dist';

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, GET, PUT");
    res.header("Access-Control-Allow-Headers", 'Authorization, CONTENT-TYPE');
    next();
});

app.use(bodyParser.json());

mysql.createConnection({
    host: 'localhost',
    user: 'gurubooru',
    password: 'se330bs',
    // user: 'root',
    // password: 'grapgrap',
    database: 'booking_system'
}).then((conn) => {
    // 로그인
    app.post('/login', (req, res) => {
        const auth = new Buffer(req.headers.authorization.split('Bearer ')[1], 'base64') + '';
        const id = auth.split(':')[0];
        const password = auth.split(':')[1];

        const url = `http://kumohweb.kumoh.ac.kr/mybsvr/login/login.jsp?id=${id}&passwd=${password}`;

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
    });
    // 예약 현황
    app.get('/bookingInfo', (req, res) => {
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
                            booking.isdelete = 0    
	                    ORDER BY booking.booking_date DESC`;
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
        data.on('part', (file) => {
            // let url = localFileUrl + '/assets/report/' + moment() + file.filename;
            let url = remoteFileUrl + '/assets/report/' + moment() + file.filename;
            const fileWriteStream = fs.createWriteStream(url);
            file.pipe(fileWriteStream);

            file.on('end', () => {
                fileWriteStream.end();
                let query = // reporter는 신고자의 예약번호, target은 용의자의 예약번호.
                    `SELECT reporter.booker as reporter, target.id as suspect FROM
                        booking AS reporter,
                        booking AS target
                        WHERE
                            target.id = ${ mysql.escape(time) } AND
                            target.section = reporter.section AND
                            target.id > reporter.id
                        ORDER BY reporter.id DESC`;

                conn.query(query).then(rows => {
                    let reporter = rows[0].reporter;
                    let suspect = rows[0].suspect;
                    let query = `INSERT INTO report (reporter, title, content, prebooker) VALUES (${ mysql.escape(reporter) }, ${ mysql.escape(title) }, ${ mysql.escape(contents) }, ${ mysql.escape(suspect)})`;
                    conn.query(query).then(result => {
                        let frontUrl = '..' + url.split('../front/src')[1];
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
        });
        data.parse(req);
    });
    // 배치도 첨부
    app.post('/layout', (req, res) => {
        const data = new multiparty.Form();
        data.on('part', (file) => {
            // let url = localFileUrl + '/assets/layout/' + moment() + file.filename;
            let url = remoteFileUrl + '/assets/layout/' + moment() + file.filename;
            const fileWriteStream = fs.createWriteStream(url);
            file.pipe(fileWriteStream);

            file.on('end', () => {
                fileWriteStream.end();
                let frontUrl = '..' + url.split('../front/src')[1];
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
            });
        });
        data.parse(req);
    });
    // 배치도 로드
    app.get('/layout', (req, res) => {
        let query = `SELECT url FROM layout WHERE isdelete = 0`;
        conn.query(query).then(rows => {
            res.send({
                status: 'success',
                result: rows[rows.length - 1] // 최신의 layout 파일 url
            });
        }).catch(err => {
            res.send({
                status: 'fail',
                result: err
            });
        })
    });
});

app.listen(3000, () => {
    console.log('Server open in 3000 port');
});