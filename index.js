const express = require('express');
const request = require('request-promise');
const mysql = require('promise-mysql');
const moment = require('moment');
const app = express();

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, GET");
    res.header("Access-Control-Allow-Headers", 'Authorization');
    next();
});

mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'grapgrap',
    // user: 'gurubooru',
    // password: 'se330bs',
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
                const query = `SELECT * FROM admin WHERE id = ${id}`;
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
                        booking_date = '${moment().format('YYYY-MM-DD')}' AND 
                        booking.isdelete = 0 AND 
                        section.id = booking.section`;
        } else if (req.query.date_flag === 'tomorrow') {
            query =
                `SELECT booking.id as id, booker, booking_time, section.name as section 
                    FROM section, booking 
                    WHERE 
                        booking_date = '${moment().add(1, 'd').format('YYYY-MM-DD')}' AND 
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
       const query = `SELECT name FROM section WHERE isdelete = 0`;
       conn.query( query ).then( rows => {
           res.send({
               status: 'success',
               result: rows
           })
       }).catch( err => {
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