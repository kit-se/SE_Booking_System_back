const express = require('express');
const request = require('request-promise');
const mysql = require('promise-mysql');
const app = express();

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, GET");
    res.header("Access-Control-Allow-Headers", 'Authorization');
    next();
});

mysql.createConnection({
    host: '13.124.177.198',
    user: 'gurubooru',
    password: 'se330bs',
    database: 'booking_system'
}).then((conn) => {
    // 로그인
    // header에 authorize 부분에 아이디와 비밀번호를 숨겨 들고와 학교 로그인 API를 이용해 로그인이 아이디와 비밀번호가 맞는지 전달
    // 로그인 요청한 인원이 관리자면 관리자라는 표시도 전달
    app.post('/login', (req, res) => {
        const auth = new Buffer(req.headers.authorization.split('Bearer ')[1], 'base64') + '';
        const id = auth.split(':')[0];
        const password = auth.split(':')[1];

        const url = `http://kumohweb.kumoh.ac.kr/mybsvr/login/login.jsp?id=${id}&passwd=${password}`;

        const expressRes = res;

        // todo: Check this id is admin.

        request(url).then(res => {
            if (res.match('OK')) {
                expressRes.send({
                    staus: 'success',
                    result: 'login success'
                })
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
});

app.listen(3000, () => {
    console.log('Server open in 3000 port');
});