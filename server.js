import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import puppeteer from "puppeteer";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// PostgreSQL Connection
const useDatabaseUrl = !!process.env.DATABASE_URL;
let dbConfig;
if (useDatabaseUrl) {
  const url = process.env.DATABASE_URL;
  const hasQuery = url.includes("?");
  const hasSslMode = /[?&]sslmode=/i.test(url);
  // Normalize to no-verify to bypass self-signed cert validation issues
  const normalizedUrl = hasSslMode
    ? url.replace(/sslmode=([^&]+)/i, "sslmode=no-verify")
    : `${url}${hasQuery ? "&" : "?"}sslmode=no-verify`;
  dbConfig = {
    connectionString: normalizedUrl,
    ssl: { require: true, rejectUnauthorized: false },
  };
} else {
  dbConfig = {
    user: process.env.PGUSER || "postgres",
    host: process.env.PGHOST || "localhost",
    database: process.env.PGDATABASE || "SDMS",
    password: process.env.PGPASSWORD || "201014",
    port: Number(process.env.PGPORT) || 5432,
  };
}
const db = new pg.Client(dbConfig);
console.log(useDatabaseUrl ? "DB: using DATABASE_URL" : "DB: using local PG config");

db.connect();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static("public"));
app.set("view engine", "ejs");

// Middleware to set currentPath for active sidebar highlighting
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

// Dashboard Routes
app.get("/", async (req, res) => {
  try {
    const totalStudents = await db.query("SELECT COUNT(*) FROM students");

    const totalFeesRes = await db.query(
      "SELECT SUM(classes.total_fees) AS total FROM students JOIN classes ON students.class_id = classes.id"
    );
    const totalPaidRes = await db.query(
      "SELECT SUM(amount_paid) AS paid FROM students"
    );
    const totalFeesVal = Number(totalFeesRes.rows[0]?.total) || 0;
    const totalPaidVal = Number(totalPaidRes.rows[0]?.paid) || 0;
    const balance = totalFeesVal - totalPaidVal;

    res.render("index", {
      totalFees: totalFeesVal,
      totalPayments: totalPaidVal.toLocaleString(),
      totalStudents: totalStudents.rows[0].count,
      totalBalance: balance,
    });
  } catch (err) {
    console.error("Error fetching students:", err);
    res.status(500).send("Server Error");
  }
});

// Display Edit Student Route
app.get("/view-student", async (req, res) => {
  try {
    const classes = await db.query("SELECT * FROM classes ORDER BY id ASC");

    res.render("viewStudent", {
      classes: classes.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error retrieving student list");
  }
});
app.get("/view-student/classId", async (req, res) => {
  try {
    const classId = req.query.classId;
    const classes = await db.query("SELECT * FROM classes ORDER BY id ASC");
    const students = await db.query(
      `SELECT students.id, students.name, classes.name AS class_name, classes.total_fees, students.amount_paid FROM students 
      JOIN classes ON students.class_id = classes.id WHERE class_id =$1 ORDER by students.id`,
      [classId]
    );
    const { search = "" } = req.query;

    const query = `SELECT students.id, students.name, classes.name AS class_name, classes.total_fees, students.amount_paid 
    FROM students JOIN classes ON students.class_id = classes.id WHERE students.name ILIKE $1 AND class_id = $2`;

    const values = [`%${search}%`, classId];

    const studentsBySearch = await db.query(query, values);
    res.render("viewStudent", {
      students:
        studentsBySearch.rows.length > 0
          ? studentsBySearch.rows
          : students.rows,
      classes: classes.rows,
      search,
      classId,
    });
  } catch (error) {
    console.error("Error Fetching classes", error);
  }
});

// Add Student Routes
app.get("/add-student", async (req, res) => {
  try {
    const classes = await db.query("SELECT * FROM classes ORDER BY id ASC");
    res.render("addStudent", {
      classes: classes.rows,
    });
  } catch (error) {
    console.error("Error Fetching classes", error);
  }
});

// 🔵 POST: Add Student with Class and Automatically Assigned Fee
app.post("/add-student", async (req, res) => {
  const { name, classId } = req.body;
  // Validation
  if (!name || !classId) {
    return res.redirect(
      "/add-student?error=" + encodeURIComponent("All fields are required.")
    );
  }
  try {
    await db.query("INSERT INTO STUDENTS (name,class_id) VALUES ($1, $2)", [
      name,
      classId,
    ]);
    res.redirect(
      "/add-student?success=" +
        encodeURIComponent("Student added successfully.")
    );
  } catch (err) {
    console.error("Error adding student:", err);
    res.redirect(
      "/add-student?error=" + encodeURIComponent("Failed to add student.")
    );
  }
});

// GET: Edit Student Page
app.get("/edit-student/:id", async (req, res) => {
  const { id } = req.params;
  try {
    // Fetch student details
    const student = await db.query("SELECT * FROM students WHERE id = $1", [
      id,
    ]);

    // Fetch all available classes for the class dropdown
    const classes = await db.query("SELECT * FROM classes ORDER BY id ASC");

    res.render("edit", { student: student.rows[0], classes: classes.rows });
  } catch (err) {
    console.error("Error fetching student:", err);
    res.status(500).send("Server Error");
  }
});

// PUT: Update Student with Fee Adjustment Based on New Class
app.post("/update-student/:id", async (req, res) => {
  const { id } = req.params;
  const { name, classId } = req.body;
  try {
    // Get the new class_id
    await db.query("UPDATE students SET name=$1, class_id=$2 WHERE id=$3", [
      name,
      classId,
      id,
    ]);

    res.redirect("/");
  } catch (err) {
    console.error("Error updating student:", err);
    res.status(500).send("Server Error");
  }
});

// 🔴 DELETE: Remove Student
app.post("/delete-student/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM payments WHERE student_id = $1", [id]);
    await db.query("DELETE FROM students WHERE id = $1", [id]);
    res.redirect("/view-student");
  } catch (err) {
    console.error("Error deleting student:", err);
    res.status(500).send("Server Error");
  }
});

// 🟢 Route to Render Automatic Fees Page
app.get("/edit-fees", async (req, res) => {
  try {
    const classes = await db.query("SELECT * FROM classes ORDER BY id ASC");
    res.render("editSchoolFees.ejs", { classes: classes.rows });
  } catch (err) {
    console.error("Error fetching classes:", err);
    res.status(500).send("Server Error");
  }
});

// 🔵 Route to Update Fees
app.post("/update-fees", async (req, res) => {
  const feesUpdates = req.body; // Object { classId: newFee }

  try {
    for (const classId in feesUpdates) {
      const newFee = parseInt(feesUpdates[classId], 10);
      if (!isNaN(newFee) && newFee >= 0) {
        await db.query("UPDATE classes SET total_fees = $1 WHERE id = $2", [
          newFee,
          classId,
        ]);
      }
    }
    res.redirect("/");
  } catch (err) {
    console.error("Error updating fees:", err);
    res.status(500).send("Server Error");
  }
});

// Route to handle Student Page
app.get("/students", async (req, res) => {
  try {
    const classes = await db.query("SELECT * FROM classes ORDER BY id ASC");

    res.render("studentList", {
      classes: classes.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error retrieving student list");
  }
});

app.get("/students/classId", async (req, res) => {
  try {
    const classId = req.query.classId;
    const classes = await db.query("SELECT * FROM classes ORDER BY id ASC");
    const students = await db.query(
      `SELECT students.id, students.name, classes.name AS class_name, classes.total_fees, students.amount_paid FROM students 
        JOIN classes ON students.class_id = classes.id WHERE class_id =$1`,
      [classId]
    );
    const { search = "" } = req.query;

    const query = `SELECT students.id, students.name, classes.name AS class_name, classes.total_fees, students.amount_paid
      FROM students JOIN classes ON students.class_id = classes.id WHERE students.name ILIKE $1 AND class_id = $2`;

    const values = [`%${search}%`, classId];
    const studentsBySearch = await db.query(query, values);
    res.render("studentList", {
      students:
        studentsBySearch.rows.length > 0
          ? studentsBySearch.rows
          : students.rows,
      classes: classes.rows,
      search,
      classId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error retrieving student list");
  }
});

// Route to handle Student Payment
app.get("/students/:id/pay", async (req, res) => {
  const studentId = req.params.id;
  const classes = await db.query("SELECT * FROM classes ORDER BY id ASC");
  const students = await db.query("SELECT * FROM students WHERE id = $1", [
    studentId,
  ]);

  res.render("paymentForm", {
    student: students.rows[0],
    classes: classes.rows,
  });
});

app.post("/students/:id/pay", async (req, res) => {
  const { id } = req.params;
  const {
    classId,
    amount_paid,
    payment_method,
    term,
    session,
    note,
    reference_code,
  } = req.body;
  const amount = Number(amount_paid);

  // Validation
  if (
    !payment_method ||
    !term ||
    !session ||
    !reference_code ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return res.redirect(
      `/students/${id}/pay?error=` +
        encodeURIComponent("All fields are required and amount must be positive.")
    );
  }

  try {
    await db.query(
      `INSERT INTO payments (student_id, amount_paid, payment_date, payment_method, term, session, note, reference_code)
           VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7) RETURNING *`,
      [id, amount, payment_method, term, session, note, reference_code]
    );
    console.log(amount);

    const totalAmount = await db.query(
      "SELECT SUM(amount_paid) AS paid FROM payments WHERE student_id=$1",
      [id]
    );

    await db.query(
      "UPDATE students SET class_id=$1, amount_paid =$2 WHERE id=$3",
      [classId, totalAmount.rows[0].paid, id]
    );
    res.redirect(
      "/students?success=" + encodeURIComponent("Payment added successfully.")
    );
  } catch (err) {
    console.error(err);
    res.redirect(
      `/students/${id}/pay?error=` + encodeURIComponent("Payment Failed.")
    );
  }
});

// Render payment history
app.get("/students/:id/payment-history", async (req, res) => {
  const studentId = req.params.id;

  const student = await db.query("SELECT * FROM students WHERE id = $1", [
    studentId,
  ]);

  const payments = await db.query(
    "SELECT * FROM payments WHERE student_id = $1 ORDER BY payment_date DESC",
    [studentId]
  );

  res.render("paymentHistory", {
    student: student.rows[0],
    payments: payments.rows,
  });
});

// Route to handle Class Payment History
app.get("/classes", async (req, res) => {
  const classes = await db.query("SELECT * FROM classes ORDER BY id ASC");
  res.render("classPayment", { classes: classes.rows });
});

app.get("/classes/:id", async (req, res) => {
  // Handle cases where the form posts to '/classes/:id' literally and sends classId as a query param
  const paramId = req.params.id;
  const classId = paramId === ":id" ? req.query.classId : paramId;
  const classes = await db.query("SELECT * FROM classes ORDER BY id ASC");

  if (!classId) {
    return res.render("classPayment", { classes: classes.rows });
  }

  const students = await db.query(
    `SELECT students.id, students.name, classes.name AS class_name, classes.total_fees, students.amount_paid FROM students JOIN classes ON students.class_id = classes.id WHERE class_id =$1`,
    [classId]
  );

  res.render("classPayment", {
    students: students.rows,
    classes: classes.rows,
  });
});

// Route to Generate PDF for each classes

app.get("/pdf", async (req, res) => {
  const classes = await db.query("SELECT * FROM classes ORDER BY id ASC");
  res.render("receipt", { classes: classes.rows });
});

app.get("/students/pdf", async (req, res) => {
  try {
    const classId = req.query.classId;
    const now = new Date();
    const dateString = now.toLocaleDateString();

    // Get students in the selected class (or all if none selected)
    const studentQuery = await db.query(
      "SELECT * FROM students WHERE class_id = $1",
      [classId]
    );
    const students = studentQuery.rows;

    // Get all payments summed by student
    const paymentSums = await db.query(`
      SELECT student_id, SUM(amount_paid) AS total_paid
      FROM payments
      GROUP BY student_id 
    `);

    // Get classes with expected fees
    const classQuery = await db.query("SELECT * FROM classes");
    const classMap = {};
    const classNameMap = {};
    classQuery.rows.forEach((cls) => {
      classMap[cls.id] = parseInt(cls.total_fees);
      classNameMap[cls.id] = cls.name;
    });

    // Map payments
    const paidMap = {};
    paymentSums.rows.forEach((row) => {
      paidMap[row.student_id] = parseInt(row.total_paid);
    });

    // Render the EJS template to HTML
    res.render(
      "pdfReport",
      {
        students,
        classNameMap,
        classId,
        dateString,
        classMap,
        paidMap,
      },
      async (err, html) => {
        if (err) {
          console.error("EJS render error:", err);
          return res.status(500).send("Error generating PDF");
        }
        try {
          const browser = await puppeteer.launch({ headless: "new" });
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: "networkidle0" });
          const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
          });
          await browser.close();
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader(
            "Content-Disposition",
            `inline; filename=student_report.pdf`
          );
          res.end(pdfBuffer);
        } catch (err) {
          console.error("Puppeteer error:", err);
          res.status(500).send("Error generating PDF");
        }
      }
    );
  } catch (err) {
    console.error(err);
    res.status(500).send("Error generating PDF");
  }
});

// Start Server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
