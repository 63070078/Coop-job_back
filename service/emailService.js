const nodemailer = require('nodemailer');
const schedule = require('node-schedule');
const { pool } = require("../config");

// สร้าง function สำหรับส่งอีเมล
async function sendEmail({ to, subject, text, html, attachments }) {
    // ตั้งค่า transporter สำหรับ nodemailer
    const transporter = nodemailer.createTransport({
        service: 'Gmail',
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: 'itscjobsearch@gmail.com',
            pass: 'hsbr fhxd syiw whcm',
        },
    });

    // ตั้งค่าข้อมูลสำหรับอีเมล
    const mailOptions = {
        from: 'itscjobsearch@gmail.com',
        to,
        subject,
        text,
        html,
        attachments,
    };

    // ส่งอีเมล
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent: ' + info.response);
        return info;
    } catch (error) {
        console.error('Error sending email: ', error);
        throw error;  // โยนข้อผิดพลาดออกไป
    }
}

async function prepareAndSendEmails() {
    const [companies] = await pool.query('SELECT * FROM companies');
    for (const company of companies) {
        let emailContent = `<h1>รายชื่อผู้สมัครสำหรับบริษัท ${company.company_name}</h1>`;
        const [jobs] = await pool.query('SELECT * FROM jobs WHERE user_id = ?', [company.user_id]);
        if (jobs.length === 0) {
            emailContent += `<p>ไม่มีตำแหน่งงานที่เปิดรับสมัครในขณะนี้</p>`;
        } else {
            for (const job of jobs) {
                const [applications] = await pool.query('SELECT * FROM applications WHERE job_id = ? AND application_status = ? ', [job.job_id, 'pending']);

                if (applications.length > 0) {
                    emailContent += `<h2>ตำแหน่ง: ${job.job_title} (จำนวนผู้สมัคร: ${applications.length})</h2><ul>`;

                    for (const application of applications) {
                        const [[student]] = await pool.query('SELECT * FROM students WHERE user_id = ?', [application.student_id]);

                        if (student) {
                            emailContent += `<li>ชื่อผู้สมัคร ${student.firstName} ${student.lastName}</li>`;
                        }
                    }
                    emailContent += '</ul>';
                } 
            }
        }
        await sendEmail({
            to: company.contact_email,
            subject: 'รายงานรายชื่อผู้สมัครสัปดาห์นี้',
            html: emailContent,
        });
    }
}


const weeklyEmailScheduler = () => {
   schedule.scheduleJob({hour: 8, minute: 0, dayOfWeek: 1}, async () => { //ส่งรายงานในตอนเช้าของวันจันทร์ 8 โมง
// schedule.scheduleJob('*/1 * * * *', async () => { //ทดสอบให้ส่งทุก1นาที
    console.log('Preparing to send weekly reports to all companies...');
    await prepareAndSendEmails();
    console.log('Weekly reports sent successfully to all companies.');
    });
};

module.exports = { sendEmail, weeklyEmailScheduler };

