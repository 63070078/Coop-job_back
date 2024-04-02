const express = require('express');
const { pool } = require("../config");
const router = express.Router();
const Joi = require('joi');
const bcrypt = require('bcrypt');
const { generateToken } = require("../utils/token");
const { v4: uuidv4 } = require('uuid');
const { isLoggedIn } = require("../middleware");
const multer = require('multer');
const { json } = require('body-parser');
const { sendEmail, weeklyEmailScheduler } = require('../service/emailService');

weeklyEmailScheduler(); // เริ่มต้นการทำงานของ Scheduler

// ตั้งค่า multer upload
const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'static/coop302/'); 
    },
    filename: function (req, file, cb) {
      const uniqueFileName = `${uuidv4().slice(0, 4)}-${file.originalname}`;
      cb(null, uniqueFileName); // กำหนดชื่อไฟล์เก็บในโฟลเดอร์เป็นชื่อที่ไม่ซ้ำกัน
    }
  }),
});

// สมัครงาน
router.post('/sendApplicationJob', isLoggedIn, async (req, res) => {
  try {
    const { job_id, user_id } = req.body;
    const [isStudentOpen] = await pool.query(
      'SELECT * FROM students WHERE user_id = ? AND student_status != "open"',[user_id]
    )
    if (isStudentOpen.length > 0){
      return res.status(400).json({ error: 'โปรดกรอกข้อมูลให้ครบถ้วนก่อน ถึงจะสามารถสมัครงานได้' });
    }
    // ตรวจสอบว่า user_id นี้มีการอนุมัติงานอื่นอยู่แล้วหรือไม่
    const [alreadyApproveApplication] = await pool.query(
      'SELECT * FROM applications WHERE student_id = ? AND application_status = "approve"',
      [user_id]
    );

    if (alreadyApproveApplication.length > 0) {
      // ถ้ามีงานที่ได้รับการอนุมัติแล้ว
      return res.status(400).json({ error: 'คุณมีงานที่ได้รับการอนุมัติแล้ว ไม่สามารถสมัครเพิ่มได้' });
    }

    // ตรวจสอบว่า user_id นี้เคยสมัคร job_id นี้แล้วหรือไม่ (รวมถึงสถานะ 'cancelled' ถ้าเกิดว่ายกเลิกแล้วให้สมัครใหม่ได้)
    const [existingApplication] = await pool.query(
      'SELECT * FROM applications WHERE job_id = ? AND student_id = ? AND application_status != "canceled"',
      [job_id, user_id]
    );

    if (existingApplication.length > 0) {
      // ถ้ามีการสมัครซ้ำแล้วหรือถูกยกเลิก
      return res.status(400).json({ error: 'คุณได้สมัครงานนี้แล้ว' });
    }

    // ถ้ายังไม่มีการสมัคร
    const [result] = await pool.query(
      'INSERT INTO applications (job_id, student_id, application_status, applied_datetime) VALUES (?, ?, "pending", NOW())',
      [job_id, user_id]
    );

    res.json({ message: 'Application submitted successfully', applicationId: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});


// Get job applications for a specific user with additional details //แสดงรายการงานที่สมัคร
router.get('/getJobApplications', isLoggedIn, async (req, res) => {
  const userId = req.user.user_id;
  try {
    const [results] = await pool.query(`
        SELECT ja.*, j.*, c.*
        FROM applications ja
        INNER JOIN jobs j ON ja.job_id = j.job_id
        LEFT JOIN companies c ON j.user_id = c.user_id
        WHERE ja.student_id = ?
    `, [userId]);

    console.log("getJobApplications complete");

    res.json(results);
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
  }
});

// Get job applications for a specific user with additional details //แสดงรายการงานที่สมัคร
router.get('/getJobApprovedApplication', isLoggedIn, async (req, res) => {
  const userId = req.user.user_id;
  try {
    const [results] = await pool.query(`
        SELECT ja.*, j.*, c.*
        FROM applications ja
        INNER JOIN jobs j ON ja.job_id = j.job_id
        LEFT JOIN companies c ON j.user_id = c.user_id
        WHERE ja.student_id = ? AND ja.application_status = 'approve'
    `, [userId]);

    console.log("getJobApplications complete");

    res.json(results);
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
  }
});

//ยกเลิกการสมัครงาน
router.put('/cancelJob/:applicationId', isLoggedIn, async (req, res) => {
  const { application_status } = req.body;
  const applicationId = req.params.applicationId;
  try {
    await pool.query('UPDATE applications SET application_status = ? WHERE application_id = ?', [application_status, applicationId]);
    res.json({ message: 'ยกเลิกการสมัครงานเรียบร้อย' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});


// Get job applications for a specific recruiter // ใบสมัครทั้งหมดของบริษัทนั้นๆ
router.get('/getApplication/:applicationId', isLoggedIn, async (req, res) => {
  const applicationId = req.params.applicationId;
  try {
    // ดึงข้อมูลแอพลิเคชันโดยใช้ applicationId
    const applications = await pool.query('SELECT * FROM applications WHERE application_id = ?', [applicationId]);
    res.json(applications);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// List ใบสมัครแบบเจาะจงเฉพาะงานนั้นๆ
router.get('/getApplicationByJob/:jobId', isLoggedIn, async (req, res) => {
  const jobId = req.params.jobId;
  try {
    const [applicationsByjob] = await pool.query(`
      SELECT sj.*, st.* , js.*
      FROM applications sj
      JOIN students st ON sj.student_id = st.user_id
      JOIN jobs js ON js.job_id = sj.job_id
      
      WHERE sj.job_id = ?
    `, [jobId]);
    res.json(applicationsByjob);
    console.log("getApplicationByJob with student details success");
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get job applications for all recruiter
router.get('/getApplications', isLoggedIn, async (req, res) => {
  const recruiterId = req.user.user_id;
  try {
    const [results] = await pool.query(`
    SELECT sj.*, st.*, j.*
    FROM applications sj
    JOIN students st ON sj.student_id = st.user_id
    JOIN jobs j ON sj.job_id = j.job_id
    WHERE j.user_id = ?;
      `, [recruiterId]);
    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

//ตอบรับการสมัครงาน, อัพโหลดไฟล์ coop
router.put('/acceptApplicant/:applicationId', isLoggedIn, upload.single('coopfile'), async (req, res) => {
  const applicationId = req.params.applicationId;
  const { application_status } = req.body;
  const filePath = req.file.path;

  try {
    // ตรวจสอบว่าผู้สมัครมีการอนุมัติสำหรับงานอื่นหรือไม่
    const [applicantDetails] = await pool.query('SELECT * FROM applications WHERE application_id = ?', [applicationId]);
    const studentId = applicantDetails[0].student_id;

    //ตรวจสอยว่าผู้สมัครนี้มีงานที่อนุมัติแล้วหรือไม่
    const [approvedApplications] = await pool.query(
      'SELECT * FROM applications WHERE student_id = ? AND application_status = "approve"',
      [studentId]
    );
    if (approvedApplications.length > 0) {
      return res.status(400).json({ error: 'ผู้สมัครนี้มีงานที่อนุมัติแล้ว ไม่สามารถอนุมัติเพิ่มได้' });
    }

    // ตรวจสอบก่อนว่ามีการอนุมัติสำหรับผู้สมัครนี้แล้วหรือไม่
    const [existingApplication] = await pool.query(
      'SELECT * FROM applications WHERE application_id = ? AND application_status = "approve"',
      [applicationId]
    );
    if (existingApplication.length > 0) {
      return res.status(400).json({ error: 'ผู้สมัครนี้ได้รับการอนุมัติสำหรับงานนี้แล้ว' });
    }


    //ดึงข้อมูลจากตาราง students และ jobs
    const [[student]] = await pool.query('SELECT * FROM students WHERE user_id = ?', [studentId]);
    const [[job]] = await pool.query('SELECT * FROM jobs WHERE job_id = ?', [applicantDetails[0].job_id]);
   
    if (!student || !job) {
      return res.status(404).json({ error: 'Student or job not found' });
    }

    const [[company]] = await pool.query('SELECT * FROM companies WHERE user_id = ?', [job.user_id]);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

  const email = student.email;
  const firstName = student.firstName;
  const lastName = student.lastName;
  const job_title = job.job_title;
  const company_name = company.company_name;
  const contact_email = company.contact_email;
  const contact_phone_number = company.contact_phone_number;
  console.log("studentEmail", email)
  const emailData = {
    to: email, // อีเมลของผู้รับ
    subject: `การยืนยันการสมัครงานสำหรับตำแหน่ง ${job_title}`,
    text: `คุณได้รับการยืนยันการสมัครงานสำหรับตำแหน่ง ${job_title} ที่บริษัท ${company_name}. โปรดตรวจสอบไฟล์ที่แนบมาเพื่อดูรายละเอียดเพิ่มเติม.`,
    html: `
      <p><strong>เรียน คุณ${firstName} ${lastName},</strong></p>
      <p>คุณได้รับการยืนยันการสมัครงานสำหรับตำแหน่ง <strong>${job_title}</strong> ของบริษัท <strong>${company_name}</strong>.</p>
      <p>เราได้แนบแบบตอบรับและเสนองานนักศึกษาสหกิจศึกษาในไฟล์นี้. โปรดตรวจสอบและอ่านเอกสารอย่างละเอียด เพื่อทำความเข้าใจเงื่อนไขและขั้นตอนถัดไปในการเริ่มต้นการฝึกงานของคุณ.</p>
      <p>หากคุณมีคำถามหรือต้องการข้อมูลเพิ่มเติม, โปรดติดต่อเราที่ <a href='mailto:${contact_email}'>${contact_email}</a> หรือโทร <strong>${contact_phone_number}</strong>.</p>
      <p>ขอบคุณอีกครั้งสำหรับความสนใจและความพยายามในการสมัครงานกับเรา.</p>
      <p>ด้วยความเคารพ,<br>${company.company_name}</p>
    `,
    attachments: [{
      filename: 'coop302.pdf',
      path: filePath
    }]
  };

  try {
    await sendEmail(emailData);
    // โค้ดอัพเดทสถานะการสมัครใน database
  } catch (error) {
    console.error('Error in sending email:', error);
    res.status(500).json({ error: 'Error in sending email' });
  }
   
     await pool.query('UPDATE applications SET application_status = ?, coop302 = ? WHERE application_id = ?', [application_status, filePath, applicationId]);
    res.json({ message: 'อัพโหลดไฟล์สำเร็จ และสถานะการสมัครได้รับการอัพเดท' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/declineApplicant/:applicationId', isLoggedIn, async (req, res) => {
  const applicationId = req.params.applicationId;
  const { application_status } = req.body;
  try {
    await pool.query('UPDATE applications SET application_status = ? WHERE application_id = ?', [application_status, applicationId]);
    res.json({ message: 'สถานะการสมัครได้รับการอัพเดท' });
    //console.log("สถานะการสมัครได้รับการอัพเดท")
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

//ดูรายละเอียดของผู้สมัคร
router.get('/getApplicationDetails/:applicationId', async (req, res) => {
  try {
    const applicationId = req.params.applicationId;
    const [applicationResult] = await pool.query('SELECT student_id FROM applications WHERE application_id = ?', [applicationId]);
    const userId = applicationResult[0].student_id;
    const [studentResult] = await pool.query('SELECT * FROM students WHERE user_id = ?', [userId]);
    res.json(studentResult);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

//กดถูกใจงาน
router.post('/sendFavoriteJob/:jobId', isLoggedIn, async (req, res) => {
  const jobId = req.params.jobId;
  const userId = req.user.user_id;

  try {
  
    await pool.query(
      'INSERT INTO favorite_jobs (user_id, job_id) VALUES (?, ?)',
      [userId, jobId]
    );

    res.json({ message: 'Job liked successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

//ทุกงานที่ถูกใจ
router.get('/getFavoriteJobs', isLoggedIn, async (req, res) => {
  const userId = req.user.user_id;
  try {
    const [results] = await pool.query(`
      SELECT fj.*, j.job_title as job_title, c.company_name, c.profile_image, c.cover_image
      FROM favorite_jobs fj
      INNER JOIN jobs j ON fj.job_id = j.job_id
      LEFT JOIN companies c ON j.user_id = c.user_id
      WHERE fj.user_id = ?
    `, [userId]);

    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

//เชคสถานะถูกใจของแต่ละงาน
router.get('/checkJobLiked/:jobId', isLoggedIn, async(req, res) => {
  try {
    const jobId = req.params.jobId;
    const userId = req.user.user_id;
    const [result] = await pool.query('SELECT * FROM favorite_jobs WHERE job_id = ? AND user_id = ?', [jobId, userId]);

    if (result.length > 0) {
      res.json({ isLiked: true });
    } else {
      res.json({ isLiked: false });
    }
  } catch (error) {
    console.error('Error checking job like status:', error);
    res.status(500).json({ message: 'Error checking job like status' });
  }
});


// ยกเลิกการถูกใจงาน
router.delete('/cancelFavoriteJob/:jobId', isLoggedIn, async (req, res) => {
  const jobId = req.params.jobId;
  const userId = req.user.user_id;

  try {
  
    // ถ้าได้กดถูกใจไปแล้ว
    await pool.query(
      'DELETE FROM favorite_jobs WHERE user_id = ? AND job_id = ?',
      [userId, jobId]
    );

    res.json({ message: 'Job unliked successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

//รีพอร์ตงาน
router.post('/submitReport', isLoggedIn, async (req, res) => {
  
  try {
    const user_id = req.user.user_id;
    const { job_id, report_title, report_description } = req.body;
    const report_status = "pending";

    console.log('Received a POST request to /application/sendReport', req.body);
    await pool.query('INSERT INTO report_company (user_id, job_id, report_title, report_description, report_status, report_created_at) VALUES (?, ?, ?, ?, ?,  NOW())', 
    [user_id, job_id, report_title, report_description, report_status])
    res.json({ message: 'Report submitted successfully' });;
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล'});
  }
});

router.get('/getReportHistory', isLoggedIn, async (req, res) => {
  const userId = req.user.user_id;
  try {
    
    const [results] = await pool.query('SELECT *  FROM report_company WHERE user_id = ?', [userId]);
    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/getBenefitHistory', isLoggedIn, async (req, res) => {
  const userId = req.user.user_id;
  try {
    const [results] = await pool.query(`
    SELECT br.*, c.company_name, c.profile_image
    FROM benefit_reports br
    JOIN jobs j ON br.job_id = j.job_id
    JOIN companies c ON j.user_id = c.user_id
    WHERE br.user_id = ?
  `, [userId]);

  res.json(results);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post("/addBenefitReport", isLoggedIn, async (req, res) => {
  try {
    const {
      job_position,
      description,
      salary,
      benefit,
      job_id
    } = req.body;

    const user_id = req.user.user_id;

    const datePosted = new Date(); // เวลาปัจจุบัน
    const benefit_status = 'complete'

    await pool.query(
      'INSERT INTO benefit_reports (user_id, job_id,  position, description, salary, benefit, benefit_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
      [user_id, job_id, job_position, description, salary, benefit, benefit_status, datePosted]
    );

    res.status(200).json({ message: "Benefit report added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});



// อัพเดตข้อมูล benefit
router.put('/updateBenefit', isLoggedIn, async (req, res) => {
  const { benefit_id} = req.body;
  const { company_name, job_position, description, salary, benefit } = req.body;

  try {
    const sql = `
      UPDATE benefit_reports
      SET company_name = ?, position = ?, description = ?, salary = ?, benefit = ?
      WHERE benefit_id = ?
    `;
    const values = [company_name, job_position, description, salary, benefit, benefit_id];

    await pool.query(sql, values);
    res.json({ message: 'ข้อมูลได้รับการอัพเดตเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ให้คะแนนบริษัท
router.post('/submitReview', isLoggedIn, async (req, res) => {
  try {
    const { company_id, job_id, rating, comment } = req.body;
    const student_id = req.user.user_id;
    const review_status = "complete";
   
    //console.log(req.body)
    await pool.query(
      'INSERT INTO reviews (company_id, job_id, student_id, rating, comment, review_status, review_created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [company_id, job_id, student_id, rating, comment, review_status]
    );
    res.status(201).json({ message: 'รีวิวถูกบันทึกเรียบร้อยแล้ว' });
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการบันทึกข้อมูล:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
  }
});

router.get('/reviewHistory', isLoggedIn, async (req, res) => {
  try {
    const studentId = req.user.user_id; 
    const [reviewHistory] = await pool.query(
      'SELECT * FROM reviews WHERE student_id = ?',
      [studentId]
    );
    res.json(reviewHistory);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// นี่เป็นตัวอย่างโค้ดและคุณจำเป็นต้องปรับแต่งให้เข้ากับ logic และโครงสร้างของฐานข้อมูลของคุณ
router.put('/editReview', isLoggedIn, async (req, res) => {
  try {
    const { review_id, rating, comment } = req.body; // ค่าเหล่านี้ควรถูกส่งมาจาก client
    const student_id = req.user.user_id; // หรือคุณอาจมีวิธีอื่นในการรับ user id

    console.log(req.body)
    if (!review_id || rating == undefined || !comment) {
      return res.status(400).json({ message: 'ข้อมูลไม่ครบถ้วน' });
    }
    const query = 'UPDATE reviews SET rating = ?, comment = ? WHERE review_id = ? AND student_id = ?';
    await pool.query(query, [rating, comment, review_id, student_id]);

    res.status(200).json({ message: 'รีวิวได้รับการอัปเดตเรียบร้อยแล้ว' });
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการแก้ไขรีวิว:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการแก้ไขรีวิว' });
  }
});

// Route เพื่อดึงข้อมูล applications จากฐานข้อมูล // เน้น coop302
router.get('/getStudentJobs', isLoggedIn, async (req, res) => {
  const userId = req.user.user_id;
  const jobId = req.query.job_id; // รับค่า jobId จาก query parameter ที่ส่งมาจาก frontend
  try {
    const [results] = await pool.query(`
      SELECT *
      FROM applications
      WHERE student_id = ? AND job_id = ?
    `, [userId, jobId]);
    
    const data = results.map((row) => {
      return {
        job_id: row.job_id,
        student_id: row.student_id,
        datetime: row.datetime,
        coop302: row.coop302,
      };
    });
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});


module.exports = router;

