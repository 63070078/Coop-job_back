
const mysql = require("mysql2/promise");
require("dotenv").config(); //ใข้งาน .env

const password = `${process.env.DB_PASSWORD}`;
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password:password, // ใช้ environment variable หรือใส่ค่าเริ่มต้น
  database: 'itjs',
  connectionLimit: 10,
});

module.exports = {
  pool,
};
