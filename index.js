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
    //330관리
    app.get('/admin', (req, res) => {
        const query = 'SELECT id, credit, name, position FROM admin WHERE isdelete = 0';
        conn.query(query).then(rows => {
            res.send({
              status = 'success',
              result = rows
            })
        })catch(err => {
            res.send({
                status: 'fail',
                result: err
            })
        })
    })
});

app.listen(3000, () => {
    console.log('Server open in 3000 port');
});
