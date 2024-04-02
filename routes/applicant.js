const express = require('express');
const { pool } = require("../config");
const router = express.Router();
const Joi = require('joi');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { isLoggedIn } = require("../middleware");
const { v4: uuidv4 } = require('uuid');

router.get('/getData', isLoggedIn, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM students WHERE user_id=?', [req.user.user_id]);
    //console.log("applicant GetData", req.user.user_id)
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
const passwordValidator = (value, helpers) => {
  if (value.length < 8) {
    throw new Joi.ValidationError("Password must contain at least 8 characters");
  }
  if (!(value.match(/[a-z]/) && value.match(/[A-Z]/) && value.match(/[0-9]/))) {
    throw new Joi.ValidationError("Password must be harder");
  }
  return value;
};
const signupSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required().custom(passwordValidator),
  confirm_password: Joi.string().required().valid(Joi.ref("password")),
});

router.post('/signup', async (req, res) => {
  try {
    await signupSchema.validateAsync(req.body, { abortEarly: false });
  } catch (err) {
    return res.status(400).send(err);
  }
  try {
    const email = req.body.email;
    const password = req.body.password;
    const role = "applicant";
    const datePosted = new Date();
    // เข้ารหัสรหัสผ่านก่อนเก็บในฐานข้อมูล
    const hashedPassword = await bcrypt.hash(password, 10);
    const [existingUser] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    // บันทึกผู้ใช้ในฐานข้อมูล
   await pool.query('INSERT INTO users (email, password,created_at, role) VALUES (?, ?, ?, ? )', [email, hashedPassword,datePosted, role]);
    console.log("User registered successfully")
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post("/editProfile", isLoggedIn, async (req, res) => {
  try {
    const {
      academic_year,
      studentID,
      firstName,
      lastName,
      birthdate,
      phone_number,
      gender,
      email,
      address,
    } = req.body;
    const userId = req.user.user_id;
    // ใช้ Joi เพื่อตรวจสอบข้อมูลที่ผู้ใช้แก้ไข
    // อัพเดตข้อมูลส่วนตัวในฐานข้อมูล
    await pool.query(
      `UPDATE students SET academic_year=?, studentID=?, firstName=?, lastName=?, birthdate=?, phone_number=?, gender=?, email=?, address=? WHERE user_id=?`,
      [academic_year, studentID,firstName, lastName, birthdate, phone_number, gender, email, address, userId]
    );
   // await pool.query(
   //   `UPDATE users SET email=? WHERE user_id=?`,
   //   [email, userId]
   // );
    res.status(200).json({ message: "แก้ไขข้อมูลสำเร็จ" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

//สำหรับตรวจสอบไฟล์ ที่รับมา
const resumeSchema = Joi.object({
  resume: Joi.string().required()
});

//สำหรับตรวจสอบไฟล์ ที่รับมา
const transcriptSchema = Joi.object({
  transcript: Joi.string().required()
});

//สำหรับตรวจสอบไฟล์ ที่รับมา
const portfolioSchema = Joi.object({
  portfolio: Joi.string().required()
});


// ตั้งค่า multer upload
const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'static/resume/'); // กำหนดโฟลเดอร์ที่จะเก็บไฟล์ให้เป็น static/resume/
    },
    filename: function (req, file, cb) {
      const uniqueFileName = `${uuidv4().slice(0, 4)}-${file.originalname}`;
      cb(null, uniqueFileName); // กำหนดชื่อไฟล์เก็บในโฟลเดอร์เป็นชื่อที่ไม่ซ้ำกัน
    }
  }),
  fileFilter: function (req, file, cb) {
    if (file.mimetype !== 'application/pdf') { //ตัวกรองไฟล์ที่อนุญาตให้อัปโหลดเฉพาะไฟล์ PDF
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 15 * 1024 * 1024  // กำหนดขนาดสูงสุดของไฟล์เป็น 15MB
  }
});

// ตั้งค่า multer upload
const uploadTranscript = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'static/transcript/'); // กำหนดโฟลเดอร์ที่จะเก็บไฟล์ให้เป็น static/resume/
    },
    filename: function (req, file, cb) {
      const uniqueFileName = `${uuidv4().slice(0, 4)}-${file.originalname}`;
      cb(null, uniqueFileName); // กำหนดชื่อไฟล์เก็บในโฟลเดอร์เป็นชื่อที่ไม่ซ้ำกัน
    }
  }),
  fileFilter: function (req, file, cb) {
    if (file.mimetype !== 'application/pdf') { //ตัวกรองไฟล์ที่อนุญาตให้อัปโหลดเฉพาะไฟล์ PDF
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 15 * 1024 * 1024  // กำหนดขนาดสูงสุดของไฟล์เป็น 15MB
  }
});

// ตั้งค่า multer upload portfolio
const uploadPortfolio = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'static/portfolio/'); // กำหนดโฟลเดอร์ที่จะเก็บไฟล์ให้เป็น static/portfolio/
    },
    filename: function (req, file, cb) {
      const uniqueFileName = `${uuidv4().slice(0, 4)}-${file.originalname}`;
      cb(null, uniqueFileName); // กำหนดชื่อไฟล์เก็บในโฟลเดอร์เป็นชื่อที่ไม่ซ้ำกัน
    }
  }),
  fileFilter: function (req, file, cb) {
    if (file.mimetype !== 'application/pdf') { //ตัวกรองไฟล์ที่อนุญาตให้อัปโหลดเฉพาะไฟล์ PDF
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 15 * 1024 * 1024  // กำหนดขนาดสูงสุดของไฟล์เป็น 15MB
  }
});


//อัพโหลด resume
router.post('/uploadResume',isLoggedIn, upload.single('resume'), async (req, res) => {
  try {
    const { error, value } = resumeSchema.validate({ resume: req.file.path });
    if (error) {
      console.log(error);
      return res.status(400).json({ error: 'Invalid file' });
    }
    const filePath = req.file.path;
    const student_status = "open"
    console.log("ResumePath", filePath)
    const userId = req.user.user_id;
    // บันทึกชื่อไฟล์เข้าฐานข้อมูล และ ใช้ฟังก์ชัน UUID() เพื่อสร้างชื่อไฟล์ที่ไม่ซ้ำกัน
    await pool.query('UPDATE students SET student_status=?, resume=? WHERE user_id = ?', [student_status, filePath, userId]);
    console.log("File uploaded successfully")
    return res.json({ message: 'File uploaded successfully', filePath:filePath });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


//อัพโหลด transcript
router.post('/uploadTranscript',isLoggedIn, uploadTranscript.single('transcript'), async (req, res) => {
  try {
    const { error, value } = transcriptSchema.validate({ transcript: req.file.path });
    if (error) {
      console.log(error);
      return res.status(400).json({ error: 'Invalid file' });
    }
    const filePath = req.file.path;
    console.log("TranscriptPath", filePath)
    const userId = req.user.user_id;
    const student_status = "open"
    // บันทึกชื่อไฟล์เข้าฐานข้อมูล และ ใช้ฟังก์ชัน UUID() เพื่อสร้างชื่อไฟล์ที่ไม่ซ้ำกัน
    await pool.query('UPDATE students SET student_status=?, transcript =? WHERE user_id = ?', [student_status, filePath, userId]);
    console.log("Transcript uploaded successfully")
    return res.json({ message: 'File uploaded successfully', filePath:filePath });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
module.exports = router;

//อัพโหลด portfolio
router.post('/uploadPortfolio',isLoggedIn, uploadPortfolio.single('portfolio'), async (req, res) => {
  try {
    const { error, value } = portfolioSchema.validate({ portfolio: req.file.path });
    if (error) {
      console.log(error);
      return res.status(400).json({ error: 'Invalid file' });
    }
    const filePath = req.file.path;
    console.log("PortfolioPath", filePath)
    const userId = req.user.user_id;
    const student_status = "open"
    // บันทึกชื่อไฟล์เข้าฐานข้อมูล และ ใช้ฟังก์ชัน UUID() เพื่อสร้างชื่อไฟล์ที่ไม่ซ้ำกัน
    await pool.query('UPDATE students SET student_status=?, portfolio =? WHERE user_id = ?', [student_status, filePath, userId]);
    console.log("Portfolio uploaded successfully")
    return res.json({ message: 'File uploaded successfully', filePath:filePath });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
module.exports = router;
