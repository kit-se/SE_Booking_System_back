const express = require('express');
const request = require('request-promise');
const app = express();

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, GET");
    next();
});

app.get('/login', (req, res) => {
    const id = req.query.id;
    const password = req.query.password;
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