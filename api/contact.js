import { MongoClient } from "mongodb";
import nodemailer from "nodemailer";

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "pmc_website";

// Email Configuration
const emailTransporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

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
  };

  try {
    await emailTransporter.sendMail(mailOptions);
    console.log("📧 Email notification sent successfully");
  } catch (error) {
    console.error("❌ Email sending error:", error);
    throw error;
  }
}

// Save contact form to MongoDB
async function saveContactForm(formData) {
  let client;
  try {
    client = await MongoClient.connect(MONGODB_URI);
    const db = client.db(DB_NAME);
    const contactsCollection = db.collection("contacts");
    
    const result = await contactsCollection.insertOne({
      name: formData.name,
      email: formData.email,
      subject: formData.subject || "",
      message: formData.message,
      submittedAt: new Date(),
      status: "new"
    });
    
    console.log("💾 Contact form saved to database");
    return result;
  } catch (error) {
    console.error("❌ Database save error:", error);
    throw error;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

// Parse form data
function parseFormData(body) {
  const params = new URLSearchParams(body);
  return {
    name: params.get('name'),
    email: params.get('email'),
    subject: params.get('subject'),
    message: params.get('message')
  };
}

// Main handler
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Parse form data
    const formData = parseFormData(req.body);
    
    console.log("\n📧 New Contact Form Submission:");
    console.log(`Name: ${formData.name}`);
    console.log(`Email: ${formData.email}`);
    console.log(`Subject: ${formData.subject}`);
    console.log(`Message: ${formData.message}`);
    console.log("---\n");

    // Validate required fields
    if (!formData.name || !formData.email || !formData.message) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Save to MongoDB
    if (MONGODB_URI) {
      await saveContactForm(formData);
    } else {
      console.warn("⚠️ Database not configured, skipping save");
    }

    // Send email notification
    if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      await sendEmailNotification(formData);
    } else {
      console.warn("⚠️ Email credentials not configured, skipping email");
    }

    // Redirect to contact page with success message
    res.writeHead(302, { Location: "/contact?sent=true" });
    res.end();
    
  } catch (error) {
    console.error("Error processing form:", error);
    res.writeHead(302, { Location: "/contact?error=true" });
    res.end();
  }
}