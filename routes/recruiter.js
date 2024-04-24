const express = require('express');
const { pool } = require("../config");
const router = express.Router();
const Joi = require('joi');
const bcrypt = require('bcrypt');
const { isLoggedIn } = require("../middleware");
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

//แสดงงานทั้งหมดที่ประกาศ
router.get("/getAllJobs", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM jobs ");
    //console.log("get all jobs success");
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});


router.get('/getData', isLoggedIn, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM companies WHERE user_id=?', [req.user.user_id]);
    console.log("applicant GetData", req.user.user_id)
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET all companies
router.get("/getRecruiter", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM companies");
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
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
  
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users');
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
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
    const role = "recruiter";
  const datePosted = new Date();
    // เข้ารหัสรหัสผ่านก่อนเก็บในฐานข้อมูล
    const hashedPassword = await bcrypt.hash(password, 10);

    const [existingUser] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

    if (existingUser.length > 0) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // บันทึกผู้ใช้ในฐานข้อมูล
    await pool.query('INSERT INTO users (email, password, created_at, role) VALUES (?, ?, ? ,?)', [email, hashedPassword,datePosted, role]);
    console.log("User registered successfully")
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

//สำหรับตรวจสอบไฟล์ ที่รับมา
const profileEditSchema = Joi.object({
  contact_person_name:  Joi.string().required(),
  contact_phone_number: Joi.string().required(),
  contact_email: Joi.string().required(),
  contact_person_department: Joi.string().required(),
  company_name: Joi.string().required(),
  business_type: Joi.string().required(),
  company_phone_number:Joi.string().required(),
  website:Joi.string().required(),
  address:Joi.string().required(),
  location:Joi.string().required(),
  description: Joi.string().required(),
  expedition:Joi.string().required(),
  company_video: Joi.string(),
});


// ตั้งค่า multer upload
const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'static/uploads/');
    },
    filename: function (req, file, cb) {
      const uniqueFileName = `${uuidv4().slice(0, 4)}-${file.originalname}`;
      cb(null, uniqueFileName);
    },
    
  
  }),
  limits: {
    fileSize: 15 * 1024 * 1024
  }
});


router.post("/editProfile", isLoggedIn, upload.fields([{ name: "profile_image", maxCount: 1 }, { name: "cover_image", maxCount: 1 }]), async (req, res) => {
  try {
    //const { error } = profileEditSchema.validate(req.body);
   // if (error) {
   //   return res.status(400).json({ message: error.details[0].message });
   // }

    const {
      contact_person_name,
      contact_phone_number,
      contact_email,
      contact_person_department,
      company_name,
      business_type,
      company_phone_number,
      website,
      address,
      location,
      description,
      expedition,
      company_video,
    } = req.body;

    // Uncomment the following lines if you are handling business types
     const businessTypeArray = JSON.parse(business_type);
     const businessTypeString = JSON.stringify(businessTypeArray);
    
    const companyId = req.user.user_id;
    const [existingCompanyProfile] = await pool.query('SELECT profile_image FROM companies WHERE user_id = ?', [companyId]);
    const [existingCompanyCover] = await pool.query('SELECT cover_image FROM companies WHERE user_id = ?', [companyId]);

    const profileImageFilename = req.files && req.files['profile_image'] ? req.files['profile_image'][0].filename : existingCompanyProfile[0].profile_image.replace(/\\/g, '/').replace(/\/?uploads\//, '').replace('/static', '');
    const coverImageFilename = req.files && req.files['cover_image'] ? req.files['cover_image'][0].filename : existingCompanyCover[0].cover_image.replace(/\\/g, '/').replace(/\/?uploads\//, '').replace('/static', '');

    const profileImageUrl = `/static/uploads/${profileImageFilename}`;
    const coverImageUrl = `/static/uploads/${coverImageFilename}`;

    // Update the database with the new information
    const [result] = await pool.query(
      'UPDATE companies SET contact_person_name = ?, contact_phone_number = ?, contact_email = ?, contact_person_department = ?, company_name = ?, description = ?, expedition = ?, business_type = ?, company_phone_number = ?, website = ?, address = ? , location = ?, profile_image = ?, cover_image = ?, company_video = ? WHERE user_id = ?',
      [
        contact_person_name,
        contact_phone_number,
        contact_email,
        contact_person_department,
        company_name, 
        description,
        expedition,
        businessTypeString, 
        company_phone_number,
        website,
        address,
        location,
        profileImageUrl, 
        coverImageUrl, 
        company_video, 
        companyId
      ]);

    
      await pool.query('UPDATE companies SET status = ? WHERE user_id = ?', ['open', companyId]);
    

    console.log("Recruiter edit Profile Successfully");

    res.json({ message: 'File uploaded successfully', profile_image: profileImageFilename });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
});

const addJobByUploadSchema = Joi.object({
  job_title: Joi.string().required(),
  status: Joi.string().valid("open", "close").required(),
  create_type: Joi.string().valid("upload", "form").required(),
  description: Joi.string().required(),
  internship_duration: Joi.number().min(0),

});


const addJobSchema = Joi.object({
  job_type:Joi.string().required(),
  project_name:Joi.string().required(),
  job_title:Joi.string().required(),
  description:Joi.string().required(),
  position_type:Joi.string().required(),
  quantity:Joi.string().required(),
  gpa:Joi.string().required(),
  salary:Joi.number().required().min(0),
  benefit:Joi.string().required(),
  specification:Joi.string().required(),
  internship_duration:Joi.number().min(0),
  status:Joi.string().valid("open", "close").required(),
});

router.post("/addJobByUpload", isLoggedIn, upload.single("job_upload_file"), async (req, res) => {
  try {
    // ตรวจสอบความถูกต้องของข้อมูลที่รับเข้ามา
    const { error, value } = addJobByUploadSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({ message: error.details.map((detail) => detail.message) });
    }

    const { job_title, website, status, create_type, description, internship_duration } = value;
    const datePosted = new Date(); // เวลาปัจจุบัน
    const uploadedFile = req.file;
    if (!uploadedFile) {
      return res.status(400).json({ message: "กรุณาอัปโหลดไฟล์" });
    }

    const newFileName = `job-upload-${uploadedFile.filename}`;
    const newFilePath = path.join(uploadedFile.destination, newFileName);
    fs.renameSync(uploadedFile.path, newFilePath);

    await pool.query(
      'INSERT INTO jobs (user_id, job_title, job_upload_file, job_status, create_type, description, internship_duration, date_posted) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.user_id, job_title, newFilePath, status, create_type, description, internship_duration, datePosted]
    );

    console.log("addJobByUpload");
    res.status(200).json({ message: "Job added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/addJob", isLoggedIn, async (req, res) => {
  try {
    // ตรวจสอบความถูกต้องของข้อมูลที่รับเข้ามาs
    const { error, value } = addJobSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({ message: error.details.map((detail) => detail.message) });
    }
    // สร้างข้อมูลงานใหม่
    const {
      job_type,
      project_name,
      job_title,
      description,
      quantity,
      gpa,
      position_type,
      salary,
      benefit, 
      specification,
      internship_duration,
      status,
    } = value;

    const create_type = 'form';
    // เพิ่มข้อมูลวันที่
    const datePosted = new Date(); // เวลาปัจจุบัน
    // เพิ่มข้อมูลงานใหม่ลงในตาราง jobs
    await pool.query(
      'INSERT INTO jobs (user_id, job_type, project_name, job_title, description, quantity, gpa, position_type, salary, benefit,  specification,  internship_duration, create_type, job_status, date_posted) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.user_id, 
        job_type,
        project_name,
        job_title,
        description,
        quantity,
        gpa,
        position_type,
        salary,
        benefit, 
        specification,
        internship_duration,
        create_type,
        status,
        datePosted
      ]
    );

    console.log("addJob ", );
    res.status(200).json({ message: "Job added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

//แสดงงานทั้งหมด ของผู้ใช้
router.get("/getJob", isLoggedIn, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const [rows] = await pool.query("SELECT * FROM jobs WHERE user_id = ?", [userId]);
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

//ลบงานตาม job_id ที่ส่งมา
router.delete("/deleteJob/:job_id", isLoggedIn, async (req, res) => {
  try {
    const { job_id } = req.params;

    await pool.query('DELETE FROM jobs WHERE job_id = ?', [job_id]);
    res.status(200).json({ message: "Job deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});


router.get('/getRecruiterReviews/:companyId', async (req, res) => {
  const { companyId } = req.params;

  try {
      const reviewsQuery = `
          SELECT r.*, c.user_id, j.job_title
          FROM reviews AS r
          JOIN companies AS c ON r.company_id = c.user_id
          JOIN jobs AS j ON j.job_id = r.job_id
          WHERE r.company_id = ?
      `;

      const [reviews] = await pool.query(reviewsQuery, [companyId]);
      res.json(reviews);
  } catch (error) {
      console.error('Error getting recruiter reviews:', error);
      res.status(500).json({ message: 'Error getting recruiter reviews' });
  }
});


const updateJobStatusSchema = Joi.object({
  job_status: Joi.string().valid('open', 'close').required(),
});
router.put('/updateJobStatus/:jobId', isLoggedIn, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { error, value } = updateJobStatusSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({ message: error.details.map((detail) => detail.message) });
    }
    const {
      job_status,
    } = value;
  
    await pool.query(
      'UPDATE jobs SET job_status = ? WHERE job_id = ?',
      [job_status, jobId]
    );
    
  
    res.status(200).json({ message: 'Job status updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/updateJob/:jobId', isLoggedIn, upload.single('job_upload_file'), async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!jobId) {
      return res.status(400).json({ message: 'Job ID is missing' });
    }

    const { job_type, project_name, job_title, description, position_type, quantity, gpa, salary, benefit, specification, internship_duration, job_status } = req.body;


    await pool.query(
      'UPDATE jobs SET job_type = ?, project_name = ?, job_title = ?, description = ?, position_type = ?, quantity = ?, gpa = ?, salary = ?, benefit = ?, specification = ?, internship_duration = ?, job_status = ? WHERE job_id = ?',
      [job_type, project_name, job_title, description, position_type, quantity, gpa, salary, benefit, specification, internship_duration, job_status, jobId]
    );

    res.status(200).json({ message: 'Job updated successfully' });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/updateUploadJob/:jobId', isLoggedIn, upload.single('job_upload_file'), async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!jobId) {
      return res.status(400).json({ message: 'Job ID is missing' });
    }

    const [existingJob] = await pool.query('SELECT job_upload_file FROM jobs WHERE job_id = ?', [jobId]);
    const existingFilePath = existingJob[0].job_upload_file;

    const uploadedFile = req.file;
    let newFilePath = existingFilePath;

    if (uploadedFile) {
      const newFileName = `job-upload-${uploadedFile.filename}`;
      newFilePath = path.join(uploadedFile.destination, newFileName);
      fs.renameSync(uploadedFile.path, newFilePath);
    }

    const { job_type, project_name, job_title, description, position_type, quantity, gpa, salary, benefit, specification, internship_duration, job_status } = req.body;

    await pool.query(
      'UPDATE jobs SET job_type = ?, project_name = ?, job_title = ?, description = ?, position_type = ?, quantity = ?, gpa = ?, salary = ?, benefit = ?, specification = ?, internship_duration = ?, job_status = ?, job_upload_file = ? WHERE job_id = ?',
      [job_type, project_name, job_title, description, position_type, quantity, gpa, salary, benefit, specification, internship_duration, job_status, newFilePath, jobId]
    );

    res.status(200).json({ message: 'Job updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


// change email
router.post('/changeEmail', isLoggedIn, async (req, res) => {
  try {
    const { email, password } = req.body;
    const userId = req.user.user_id;
    // Validate the email and password
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    // Authenticate the user
    const [user] = await pool.query('SELECT * FROM users WHERE user_id = ?', [userId]);
    if (!user || !(await bcrypt.compare(password, user[0].password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
     // Check if the new email is already in use by another user
     const [existingUser] = await pool.query('SELECT * FROM users WHERE email = ? AND user_id != ?', [email, userId]);
     if (existingUser.length > 0) {
       return res.status(402).json({ message: 'Email is already in use by another user' });
     }
    // Update the email
    await pool.query('UPDATE users SET email = ? WHERE user_id = ?', [email, userId]);
    res.status(200).json({ message: 'Email changed successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/changePassword', isLoggedIn, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.user_id;

    // Validate the current password and new password
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    // Authenticate the user
    const [user] = await pool.query('SELECT * FROM users WHERE user_id = ?', [userId]);
    if (!user || !(await bcrypt.compare(currentPassword, user[0].password))) {
      return res.status(401).json({ message: 'Invalid current password' });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the password
    await pool.query('UPDATE users SET password = ? WHERE user_id = ?', [hashedPassword, userId]);

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get recruiter details
router.get('/getRecruiterDetails/:companyId', async (req, res) => {
  const companyId = req.params.companyId;
  try {
    const [results] = await pool.query('SELECT * FROM companies WHERE user_id = ?', [companyId]);
    if (results.length > 0) {
      const recruiter = results[0];
      res.json(recruiter);
    } else {
      res.status(404).json({ message: 'Recruiter not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get company jobs
router.get('/getCompanyJobs/:companyId', async (req, res) => {
  const companyId = req.params.companyId;
  try {
    const [results] = await pool.query(`
    SELECT * FROM Jobs WHERE user_id = ?
`, [companyId]);
    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

//Get company jobs in jobDetail page
router.get('/getAnotherJobs/:companyId', async (req, res) => {
  const companyId = req.params.companyId;
  try {
    const [results] = await pool.query('SELECT * FROM Jobs WHERE user_id = ?', [companyId]);
    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});



// job details
router.get('/getJobDetail/:jobId', async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const [results] = await pool.query(`
        SELECT j.*,c.*, c.description AS company_description, j.description AS job_description
        FROM jobs j
        JOIN companies c ON j.user_id = c.user_id
        WHERE j.job_id = ?
    `, [jobId]);

    console.log("getJobApplications complete");

    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});



module.exports = router;