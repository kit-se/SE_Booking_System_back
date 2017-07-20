const express = require('express');
const request = require('request-promise');
const app = express();

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, GET");
    res.header("Access-Control-Allow-Headers", 'Authorization');
    next();
});

app.post('/login', (req, res) => {
    const auth = new Buffer (req.headers.authorization.split('Bearer ')[1], 'base64') + '';
    const id = auth.split(':')[0];
    const password = auth.split(':')[1];

    const url = `http://kumohweb.kumoh.ac.kr/mybsvr/login/login.jsp?id=${id}&passwd=${password}`;

    const expressRes = res;

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

app.listen(3000, () => {
    console.log('Server open in 3000 port');
});