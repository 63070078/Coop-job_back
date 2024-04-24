const express = require('express');
const app = express();
const cors = require("cors");
const path = require('path');
const router = express.Router();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Statics
app.use(express.static('static'))
app.use(express.json()) // for parsing application/json
app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded

app.use("/applicant", require("./routes/applicant"));
app.use("/application", require("./routes/application"));
app.use("/recruiter", require("./routes/recruiter"));
app.use("/user", require("./routes/user"));
app.use("/admin", require("./routes/admin"));
app.get("/welcome", (req, res) => {
  res.status(200).send("Welcome 🙌 ");
});

const port = 4000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
