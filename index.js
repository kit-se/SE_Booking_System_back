const express = require('express');
const request = require('request-promise');
const mysql = require('promise-mysql');
const moment = require('moment');
const bodyParser = require('body-parser');
const app = express();

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, GET");
    res.header("Access-Control-Allow-Headers", 'Authorization, CONTENT-TYPE');
    next();
});

app.use(bodyParser.json());

mysql.createConnection({
    host: 'localhost',
    user: 'gurubooru',
    password: 'se330bs',
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
                const query = `SELECT * FROM admin WHERE id = ${ mysql.escape(id) }`;
                conn.query(query).then(rows => {
                    if (rows.length !== 0) {
                        expressRes.send({
                            staus: 'success',
                            result: 'login success',
                            isAdmin: true
                        })
                    } else {
                        expressRes.send({
                            staus: 'success',
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
            console.log(error);
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
        let query = `SELECT * FROM booking WHERE booking_date = ${mysql.escape(data.booking_date)} AND section = ${mysql.escape(data.section)}`;
        conn.query(query).then(rows => { // 입력받은 예약정보의 날짜, 섹션에 해당하는 예약 정보 호출
            console.log( rows );
            let canInsert = true;
            let bookingTime = data.booking_time.split(', ');
            for (let i = 0; i < rows.length; i++) { // 입력받은 예약정보의 예약 시간과 1시간이라도 겹치는 row가 발견되면 INSERT 하지 않음.
                if ( !canInsert ) break; // insert를 하지 못하면 loop 종료
                let bookedTime = rows[i].booking_time.split(', ');
                for ( let j = 0; j < bookedTime.length; j++ ) {
                    if ( bookingTime.indexOf( bookedTime[j] ) !== -1 ) { // 겹치는 시간이 존재한다는 뜻
                        canInsert = false; // insert 하지못함
                        break;
                    }
                }
            }

            if ( canInsert ) { // 위의 확인 과정을 거쳐서 insert를 할 수 있다고 하면 Insert를 진행함.
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
    // 관리자 추가
    app.post('/post-admin', (req, res) => {
        const data = req.body;
        let query = `SELECT * FROM admin
                    WHERE
                        credit = ${mysql.escape(data.credit)} AND
                        name = ${mysql.escape(data.name)} AND
                        isdelete = 0`;

        conn.query(query).then(rows =>{
            let canInsert = true;
            let credit = data.credit;
            let name = data.name;

            for(let i = 0; i < rows.length; i++){// 입력받은 정보와 같은 학번이나 이름을 가진 row가 발견될 경우 INSERT 하지 않음
                if(!canInsert) break;// INSERT 못할 시 loop 종료

                let adminCredit = rows[i].credit;
                let adminName = rows[i].name;

                if(credit === adminCredit && name === adminName){// 겹치는 사람이 존재한다는 뜻
                    canInsert = false;
                }
            }

            if(canInsert){// 확인 후 INSERT할 수 있다고 하면 INSERT진행
                let query = `INSERT INTO admin (credit, name, position)
                            VALUES (${mysql.escape(data.credit)}, ${mysql.escape(data.name)}, ${mysql.escape(data.position)})`;
                conn.query(query).then(rows =>{
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

        conn.query(query).then(rows =>{
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

        conn.query(query).then(rows =>{// 입력받은 정보와 같은 이름의 row가 발견되면 INSERT하지 않음
            let canInsert = true;
            let name = data.name;

            for(let i = 0; i < rows.length; i++){
                if(!canInsert) break;

                let section = rows.name;
                if(section === name){
                    canInsert = false;
            }
          }
        });

        if(canInsert){
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
    // 섹션 삭제
    app.put('/delete-section', (req, res) => {
        const data = req.body;
        let query = `SELETE id FROM section
                    WHERE
                        name = ${mysql.escape(data.name)} AND
                        isdelete = 0`;

        conn.query(query).then(rows => {
            let id = rows.id;
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
    });
    // 배치도 첨부
    app.post('/post-layout', (req, res) => {});
    // 제재 리스트
    app.get('/sanction', (req, res) => {// 제재 대상, 처리자, 처리결과, 처리일자를 받아 제재 리스트를 작성
      const query = `SELECT prebooker, manager, result, sanction_date
                    FROM report
                    WHERE
                        result IS not NULL AND
                        sanction_date IS not NULL`;

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
                        sanction_date IS NULL`;

        conn.query(query).then(rows => {
            let id = data.id;
            let query = `UPDATE report
                        SET
                          manager = ${mysql.escape(data.manager)} AND
                          result = ${mysql.escape(data.result)} AND
                          sanction_date = ${mysql.escape(data.sanction_date)}`;

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
    })

});

app.listen(3000, () => {
    console.log('Server open in 3000 port');
});
