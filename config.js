//local
const fs = require('fs');
const mysql = require('mysql2/promise');
require('dotenv').config();

//
//const password = `${process.env.DB_PASSWORD}`;
//const pool = mysql.createPool({
//  host: 'localhost',
//  user: 'root',
//  password:password, // ใช้ environment variable หรือใส่ค่าเริ่มต้น
//  database: 'itjs',
//  connectionLimit: 10,
//});
//
//module.exports = {
//  pool,
//};

//deploy

const password = `${process.env.DB_PASSWORD}`;
const caPath = "./certificates/isrgrootx1.pem";
const sslConfig = {
  ca: fs.readFileSync(caPath), // Read the CA certificate file
};
const pool = mysql.createPool({
  host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
  user: '34UWVZnEC1LsC46.root',
  password:password, // ใช้ environment variable หรือใส่ค่าเริ่มต้น
  database: 'itjs',
  connectionLimit: 10,
  ssl: sslConfig,
});

module.exports = {
  pool,
};


