import http from "http"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import querystring from "querystring"
import { MongoClient } from "mongodb"
import nodemailer from "nodemailer"
import dotenv from "dotenv"

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 3000

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017"
const DB_NAME = process.env.DB_NAME || "pmc_website"
let db = null

// Email Configuration
const emailTransporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
})

// Connect to MongoDB
async function connectDB() {
  try {
    const client = await MongoClient.connect(MONGODB_URI)
    db = client.db(DB_NAME)
    console.log("✅ Connected to MongoDB")
  } catch (error) {
    console.error("❌ MongoDB connection error:", error)
  }
}

// Send email notification
async function sendEmailNotification(formData) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.NOTIFICATION_EMAIL || process.env.EMAIL_USER,
    subject: `New Contact Form Submission: ${formData.subject || 'No Subject'}`,
    html: `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${formData.name}</p>
      <p><strong>Email:</strong> ${formData.email}</p>
      <p><strong>Subject:</strong> ${formData.subject || 'N/A'}</p>
      <p><strong>Message:</strong></p>
      <p>${formData.message}</p>
      <hr>
      <p><em>Submitted on: ${new Date().toLocaleString()}</em></p>
    `
  }

  try {
    await emailTransporter.sendMail(mailOptions)
    console.log("📧 Email notification sent successfully")
  } catch (error) {
    console.error("❌ Email sending error:", error)
    throw error
  }
}

// Save contact form to MongoDB
async function saveContactForm(formData) {
  try {
    const contactsCollection = db.collection("contacts")
    const result = await contactsCollection.insertOne({
      name: formData.name,
      email: formData.email,
      subject: formData.subject || "",
      message: formData.message,
      submittedAt: new Date(),
      status: "new"
    })
    console.log("💾 Contact form saved to database")
    return result
  } catch (error) {
    console.error("❌ Database save error:", error)
    throw error
  }
}

const mimeTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
}

const server = http.createServer(async (req, res) => {
  // Handle POST request for contact form
  if (req.method === "POST" && req.url === "/contact") {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk.toString()
    })
    req.on("end", async () => {
      try {
        const formData = querystring.parse(body)
        
        console.log("\n📧 New Contact Form Submission:")
        console.log(`Name: ${formData.name}`)
        console.log(`Email: ${formData.email}`)
        console.log(`Subject: ${formData.subject}`)
        console.log(`Message: ${formData.message}`)
        console.log("---\n")

        // Save to MongoDB
        if (db) {
          await saveContactForm(formData)
        } else {
          console.warn("⚠️ Database not connected, skipping save")
        }

        // Send email notification
        if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
          await sendEmailNotification(formData)
        } else {
          console.warn("⚠️ Email credentials not configured, skipping email")
        }

        res.writeHead(302, { Location: "/contact?sent=true" })
        res.end()
      } catch (error) {
        console.error("Error processing form:", error)
        res.writeHead(302, { Location: "/contact?error=true" })
        res.end()
      }
    })
    return
  }

  // Determine file path
  let filePath = req.url
  
  // Remove query string if present
  const queryIndex = filePath.indexOf('?')
  if (queryIndex !== -1) {
    filePath = filePath.substring(0, queryIndex)
  }

  // Route mapping - all HTML files are in public directory
  if (filePath === "/" || filePath === "") {
    filePath = "./public/index.html"
  } else if (filePath.startsWith("/public/")) {
    // Already has /public/ prefix
    filePath = "." + filePath
  } else {
    // Add public prefix and .html extension if needed
    filePath = "./public" + filePath
    if (!path.extname(filePath)) {
      filePath += ".html"
    }
  }

  const extname = String(path.extname(filePath)).toLowerCase()
  const contentType = mimeTypes[extname] || "application/octet-stream"

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/html" })
        res.end("<h1>404 - Page Not Found</h1><p>The page you're looking for doesn't exist.</p>", "utf-8")
      } else {
        res.writeHead(500)
        res.end("Sorry, check with the site admin for error: " + err.code, "utf-8")
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType })
      res.end(content, "utf-8")
    }
  })
})

// Initialize server
connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 PMC Website running at http://localhost:${PORT}`)
    console.log(`📁 Serving files from: ${path.join(__dirname, 'public')}`)
  })
})

// Export for Vercel
export default server