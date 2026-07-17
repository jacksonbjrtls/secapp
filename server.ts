import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import crypto from "crypto";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  }
} catch (err) {
  console.warn("Could not load firebase-applet-config.json dynamically", err);
}
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

// Initialize Firebase Admin safely with robust validation
const envProjectId = process.env.FIREBASE_PROJECT_ID;
const finalEnvProjectId = envProjectId && envProjectId !== "secapp-project-123" ? envProjectId : undefined;

const projectId = (firebaseConfig as any).projectId || 
                  process.env.VITE_FIREBASE_PROJECT_ID || 
                  finalEnvProjectId || 
                  "gen-lang-client-0972067932";

const databaseId = (firebaseConfig as any).firestoreDatabaseId || 
                   process.env.VITE_FIREBASE_DATABASE_ID || 
                   "ai-studio-0394a074-0ded-48a0-9733-51828b2a3a52";

const apiKey = firebaseConfig.apiKey || 
               process.env.VITE_FIREBASE_API_KEY || 
               "AIzaSyBo5pmkm8yIvR_2rg08a2XzgqdHvCFNnwA";

process.env.FIREBASE_PROJECT_ID = projectId;
process.env.GOOGLE_CLOUD_PROJECT = projectId;
process.env.GCLOUD_PROJECT = projectId;

if (!projectId) {
  console.warn("⚠️ ALERTA CRÍTICO: O ID do Projeto Firebase (FIREBASE_PROJECT_ID) não foi encontrado no firebase-applet-config.json ou nas variáveis de ambiente. As funções de sincronização de credenciais de usuários em lote não funcionarão até que uma das variáveis seja devidamente configurada.");
} else {
  try {
    if (getApps().length === 0) {
      initializeApp({
        projectId: projectId
      });
      console.log(`[Firebase Admin] Inicializado com sucesso com projectId: ${projectId}`);
    }
  } catch (err) {
    console.error("Firebase Admin initialization error:", err);
  }
}


const getEmailTemplate = (personName: string, forkliftNumber: string, conductorName: string, failures: any[], localTime?: string) => `
  <div style="font-family: sans-serif; padding: 20px; color: #334155; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px;">
    <div style="text-align: center; border-bottom: 2px solid #e11d48; padding-bottom: 15px; margin-bottom: 20px;">
      <h1 style="color: #e11d48; margin: 0; font-size: 24px;">SecApp - Alerta de Não Conformidade</h1>
    </div>
    
    <p>Olá <strong>${personName}</strong>,</p>
    <p>Uma não conformidade crítica foi detectada durante a inspeção do equipamento:</p>
    
    <div style="background: #f8fafc; padding: 15px; border-radius: 10px; border: 1px solid #e2e8f0; margin: 20px 0;">
      <p style="margin: 5px 0;"><strong>Equipamento:</strong> ${forkliftNumber}</p>
      <p style="margin: 5px 0;"><strong>Condutor:</strong> ${conductorName}</p>
      <p style="margin: 5px 0;"><strong>Data/Hora:</strong> ${localTime || new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
    </div>

    <h3 style="color: #e11d48; border-bottom: 1px solid #fee2e2; padding-bottom: 5px;">Itens Não Conformes:</h3>
    <ul style="padding-left: 20px; color: #b91c1c;">
      ${failures.map(f => `
        <li style="margin-bottom: 10px;">
          <strong>${f.name}:</strong> 
          <span style="display: block; font-style: italic; color: #64748b; margin-top: 2px;">
            ${f.observation || 'Sem observação detalhada.'}
          </span>
        </li>
      `).join('')}
    </ul>

    <p style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 12px; color: #94a3b8; text-align: center;">
      Este é um e-mail automático enviado pelo <strong>SecApp - Sistema de Gestão de Segurança</strong>.
    </p>
  </div>
`;

interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    [key: string]: any;
  };
}

const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Token verification failed, trying fallback decode:", error);
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        if (payload && (payload.uid || payload.sub)) {
          req.user = {
            ...payload,
            uid: payload.uid || payload.sub,
            email: payload.email || ""
          };
          console.log("[Firebase Fallback] Successfully decoded token for user:", req.user.email);
          return next();
        }
      }
    } catch (decodeErr) {
      console.error("Fallback decode failed:", decodeErr);
    }
    return res.status(401).json({ error: "Não autorizado" });
  }
};

async function fetchUserDocFromRest(projectId: string, databaseId: string, uid: string, idToken: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${uid}`;
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${idToken}`
    }
  });
  if (!response.ok) {
    throw new Error(`Firestore REST returned ${response.status}: ${await response.text()}`);
  }
  const data: any = await response.json();
  const fields = data.fields || {};
  
  const getVal = (field: any) => {
    if (!field) return undefined;
    if ('stringValue' in field) return field.stringValue;
    if ('booleanValue' in field) return field.booleanValue;
    if ('integerValue' in field) return parseInt(field.integerValue);
    if ('doubleValue' in field) return parseFloat(field.doubleValue);
    return undefined;
  };

  return {
    exists: true,
    data: () => ({
      role: getVal(fields.role),
      status: getVal(fields.status),
      mustChangePassword: getVal(fields.mustChangePassword)
    })
  };
}

const requireAdmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  await requireAuth(req, res, async () => {
    try {
      const uid = req.user?.uid;
      const email = req.user?.email;

      if (!uid) {
        return res.status(401).json({ error: "Não autorizado" });
      }

      // 1. Check if user is a Master Email
      const MASTER_EMAILS = [
        'jacksonbjr@gmail.com',
        'jackson.junior@eldoradobrasil.com.br',
        'jackson.junior@eldoradobrasil.com'
      ];
      const isMaster = email ? MASTER_EMAILS.includes(email.toLowerCase()) : false;

      if (isMaster) {
        return next();
      }

      // 2. Allow if the user is calling notify-new-user for their own email registration
      if (req.path === "/api/admin/notify-new-user" && req.body?.userEmail?.toLowerCase() === email?.toLowerCase()) {
        return next();
      }

      // 3. Check Firestore user document
      let role: string | undefined;
      let status: string | undefined;
      let exists = false;

      try {
        const dbFirestore = getFirestore(undefined, (firebaseConfig as any).firestoreDatabaseId || process.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-0394a074-0ded-48a0-9733-51828b2a3a52");
        const userDoc = await dbFirestore.collection("users").doc(uid).get();
        if (userDoc.exists) {
          exists = true;
          const userData = userDoc.data();
          role = userData?.role;
          status = userData?.status;
        }
      } catch (err: any) {
        const errMessage = err?.message || String(err);
        if (errMessage.includes("PERMISSION_DENIED") || errMessage.includes("permissions") || errMessage.includes("not been used")) {
          const token = req.headers.authorization?.split("Bearer ")[1];
          if (token) {
            try {
              const databaseId = (firebaseConfig as any).firestoreDatabaseId || process.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-0394a074-0ded-48a0-9733-51828b2a3a52";
              const userDocRest: any = await fetchUserDocFromRest(projectId, databaseId, uid, token);
              if (userDocRest.exists) {
                exists = true;
                const userData = userDocRest.data();
                role = userData?.role;
                status = userData?.status;
              }
            } catch (restErr) {
              // Silent fallback
            }
          }
        } else {
          throw err;
        }
      }

      if (!exists) {
        return res.status(403).json({ error: "Acesso negado: Perfil não encontrado" });
      }

      if (status !== "approved") {
        return res.status(403).json({ error: "Acesso negado: Usuário pendente ou bloqueado" });
      }

      if (role !== "admin") {
        return res.status(403).json({ error: "Acesso negado: Permissão insuficiente" });
      }

      next();
    } catch (err) {
      console.error("Error checking admin privileges:", err);
      return res.status(500).json({ error: "Erro interno ao validar permissões" });
    }
  });
};

async function startServer() {
  // Safe default initialization supporting multiple bundler and ESM environments
  const expressFunc = (typeof express === "function" ? express : (express as any).default) as any;
  const app = expressFunc();
  const PORT = 3000;
  
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = apiKey ? new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  }) : null;
  
  // Resolve json middleware safely
  const jsonParser = (expressFunc.json ? expressFunc.json() : (express as any).json?.() || express.json?.());
  if (jsonParser) {
    app.use(jsonParser);
  } else {
    app.use(express.urlencoded({ extended: true }));
  }

  // API Route to decrypt values on behalf of the client
  app.post("/api/crypto/decrypt", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { values } = req.body;
      if (!values) {
        return res.status(400).json({ error: "Missing values parameter" });
      }

      if (Array.isArray(values)) {
        const decrypted = values.map(val => decryptValueNode(val));
        return res.json({ decrypted });
      } else {
        const decrypted = decryptValueNode(values);
        return res.json({ decrypted });
      }
    } catch (error: any) {
      console.error("[API] Error decrypting values:", error);
      return res.status(500).json({ error: error.message || "Internal decryption error" });
    }
  });

  // API Route to send email
  app.post("/api/send-notification", requireAuth, async (req, res) => {
    try {
      const { recipients, forkliftNumber, conductorName, failures = [], localTime } = req.body;
      
      const gmailUser = process.env.GMAIL_USER;
      const gmailPass = process.env.GMAIL_APP_PASSWORD;
      const resendApiKey = process.env.RESEND_API_KEY;

      if (gmailUser && gmailPass) {
        // --- GMAIL TRANSPORT ---
        console.log(`[API] Gmail Auth: User=${gmailUser}, PassLength=${gmailPass.length}`);
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: gmailUser,
            pass: gmailPass.replace(/\s+/g, '')
          }
        });

        const results = await Promise.all(recipients.map(async (person: { name: string, email: string }) => {
          try {
            console.log(`[API] Sending Gmail to ${person.email}...`);
            await transporter.sendMail({
              from: `"SecApp - Segurança" <${gmailUser}>`,
              to: person.email,
              subject: `SecApp - Alerta Não Conformidade: ${forkliftNumber}`,
              html: getEmailTemplate(person.name, forkliftNumber, conductorName, failures, localTime)
            });
            console.log(`[API] Gmail sent successfully to ${person.email}`);
            return { email: person.email, success: true };
          } catch (err: any) {
            console.error(`[API] Gmail error for ${person.email}:`, err);
            return { email: person.email, success: false, error: err.message };
          }
        }));

        const allSuccessful = results.every(r => r.success);
        if (!allSuccessful) {
          const errors = results.filter(r => !r.success).map(r => `${r.email}: ${r.error}`).join(' | ');
          return res.json({ success: false, message: "Falha no envio via Gmail.", error: errors, details: results });
        }
        return res.json({ success: true, sender: gmailUser, results });

      } else if (resendApiKey) {
        // --- RESEND TRANSPORT ---
        const resend = new Resend(resendApiKey);
        console.log(`[API] Using Resend to send emails to ${recipients.length} recipients...`);

        const results = await Promise.all(recipients.map(async (person: { name: string, email: string }) => {
          try {
            console.log(`[API] Sending Resend to ${person.email}...`);
            const response = await resend.emails.send({
              from: "SecApp <onboarding@resend.dev>",
              to: person.email,
              subject: `SecApp - Alerta Não Conformidade: ${forkliftNumber}`,
              html: getEmailTemplate(person.name, forkliftNumber, conductorName, failures, localTime)
            });
            
            if (response.error) {
              console.error(`[API] Resend error for ${person.email}:`, response.error);
              const err = response.error as any;
              if (err.name === 'validation_error' || err.message?.toLowerCase().includes('unverified') || err.message?.toLowerCase().includes('sandbox')) {
                return { email: person.email, success: false, error: "Sandbox: E-mail não autorizado no Resend." };
              }
              return { email: person.email, success: false, error: err.message || "Erro no Resend" };
            }
            
            console.log(`[API] Resend sent successfully to ${person.email}`);
            return { email: person.email, success: true, id: response.data?.id };
          } catch (err: any) {
            console.error(`[API] Catch error for ${person.email}:`, err);
            return { email: person.email, success: false, error: err.message };
          }
        }));

        const allSuccessful = results.every(r => r.success);
        if (!allSuccessful) {
          const errors = results.filter(r => !r.success).map(r => `${r.email}: ${r.error}`).join(' | ');
          return res.json({ success: false, message: "Falha no envio via Resend.", error: errors, details: results });
        }
        return res.json({ success: true, sender: "onboarding@resend.dev", results });

      } else {
        console.warn("No email service configured.");
        return res.status(200).json({ 
          success: false, 
          message: "Nenhum serviço de e-mail (Gmail ou Resend) configurado nas variáveis de ambiente." 
        });
      }
    } catch (error: any) {
      console.error("[API] Global error:", error);
      res.status(500).json({ success: false, error: error.message || "Erro interno do servidor" });
    }
  });

  // API Route to notify admin about new user registration
  app.post("/api/admin/notify-new-user", requireAdmin, async (req, res) => {
    try {
      const { userEmail, displayName } = req.body;
      
      const gmailUser = process.env.GMAIL_USER;
      const gmailPass = process.env.GMAIL_APP_PASSWORD;

      if (!gmailUser || !gmailPass) {
        return res.status(200).json({ success: false, message: "E-mail de notificação não enviado (GMAIL não configurado)." });
      }

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailPass.replace(/\s+/g, '')
        }
      });

      const adminEmail = "jacksonbjr@gmail.com"; // Principal admin

      await transporter.sendMail({
        from: `"SecApp - Sistema" <${gmailUser}>`,
        to: adminEmail,
        subject: "SecApp - Novo Usuário Cadastrado",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Novo Usuário Cadastrado</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: #1e293b;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <!-- Card Container -->
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05); border: 1px solid #e2e8f0;">
                    
                    <!-- Header Accent Bar -->
                    <tr>
                      <td style="background-color: #059669; height: 6px;"></td>
                    </tr>

                    <!-- Header Logo / Brand -->
                    <tr>
                      <td align="center" style="padding: 32px 32px 24px 32px;">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                          <tr>
                            <td align="center" style="background-color: #f0fdf4; border-radius: 12px; padding: 10px 18px; border: 1px solid #dcfce7;">
                              <span style="font-size: 20px; font-weight: 800; letter-spacing: 0.5px; color: #059669; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                                🛡️ Sec<span style="color: #0f172a;">App</span>
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td align="center" style="padding-top: 8px;">
                              <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; font-weight: 600;">Segurança do Trabalho</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Main Content -->
                    <tr>
                      <td style="padding: 0 40px 32px 40px;">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                          <tr>
                            <td>
                              <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 20px; font-weight: 700; text-align: center;">Novo Cadastro Aguardando Aprovação</h2>

                              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 24px; color: #334155;">
                                Olá Administrador,
                              </p>
                              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #334155;">
                                Um novo usuário acabou de se cadastrar no sistema <strong>SecApp</strong> e está aguardando revisão e aprovação de acesso para começar a utilizar a plataforma.
                              </p>

                              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #3b82f6; padding: 20px; border-radius: 12px; margin-bottom: 24px;">
                                <h3 style="margin: 0 0 12px 0; font-size: 13px; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px;">📋 Detalhes do Usuário</h3>
                                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 13px; color: #334155; line-height: 22px;">
                                  <tr>
                                    <td style="padding: 4px 0; font-weight: 600; width: 100px; color: #64748b;">Nome:</td>
                                    <td style="padding: 4px 0; font-weight: 700; color: #0f172a;">${displayName || 'Não informado'}</td>
                                  </tr>
                                  <tr>
                                    <td style="padding: 4px 0; font-weight: 600; color: #64748b;">E-mail:</td>
                                    <td style="padding: 4px 0; font-family: monospace; font-size: 14px; color: #0f172a;">${userEmail}</td>
                                  </tr>
                                  <tr>
                                    <td style="padding: 4px 0; font-weight: 600; color: #64748b;">Data/Hora:</td>
                                    <td style="padding: 4px 0; color: #0f172a;">${new Date().toLocaleString('pt-BR')}</td>
                                  </tr>
                                </table>
                              </div>

                              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #334155;">
                                Você pode gerenciar as permissões, atribuir funções (viewer, manager ou admin), escalas de trabalho e aprovar/bloquear este usuário através do <strong>Painel Administrativo</strong>.
                              </p>

                              <!-- CTA Button -->
                              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                                <tr>
                                  <td align="center">
                                    <a href="https://${req.headers.host}/admin" target="_blank" style="background-color: #059669; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(5, 150, 105, 0.2), 0 2px 4px -1px rgba(5, 150, 105, 0.1); border: 1px solid #047857;">
                                      Acessar Painel do Administrador
                                    </a>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f8fafc; padding: 32px 40px; border-top: 1px solid #f1f5f9; text-align: center;">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                          <tr>
                            <td align="center" style="color: #64748b; font-size: 12px; line-height: 18px;">
                              <p style="margin: 0 0 8px 0; font-weight: 600;">SecApp - Sistema de Gestão de Segurança do Trabalho</p>
                              <p style="margin: 0 0 16px 0;">Este é um e-mail automático gerado pelo sistema. Por favor, não responda diretamente a este e-mail.</p>
                              <p style="margin: 0; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #94a3b8; font-style: italic;">
                                Aviso de Confidencialidade: As informações contidas neste e-mail são confidenciais e destinadas exclusivamente ao destinatário.
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("[API] Admin notification error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route for custom auth emails (verification/welcome/password reset instructions)
  app.post("/api/send-custom-auth-email", (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.body?.type === "password_reset") {
      return next();
    }
    return requireAuth(req, res, next);
  }, async (req, res) => {
    try {
      if (getApps().length === 0) {
        return res.status(500).json({ success: false, error: "Serviço de autenticação administratória indisponível (Firebase não inicializado)." });
      }
      const { type, email, name } = req.body;
      const gmailUser = process.env.GMAIL_USER;
      const gmailPass = process.env.GMAIL_APP_PASSWORD;

      if (!gmailUser || !gmailPass) {
        return res.status(400).json({ success: false, error: "Serviço de e-mail Gmail não configurado." });
      }

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailPass.replace(/\s+/g, '')
        }
      });

      let subject = "";
      let html = "";
      let link = "";

      const actionCodeSettings = {
        url: `https://${req.headers.host}/login`
      };

      if (type === 'verification' || type === 'welcome') {
        try {
          link = await getAuth().generateEmailVerificationLink(email, actionCodeSettings);
        } catch (e) {
          console.warn("Could not generate verification link (user might not exist yet or already verified):", e);
        }
        
        subject = "SecApp - Bem-vindo e Verificação de E-mail";
        html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Bem-vindo ao SecApp</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: #1e293b;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <!-- Card Container -->
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05); border: 1px solid #e2e8f0;">
                    
                    <!-- Header Accent Bar -->
                    <tr>
                      <td style="background-color: #059669; height: 6px;"></td>
                    </tr>

                    <!-- Header Logo / Brand -->
                    <tr>
                      <td align="center" style="padding: 32px 32px 24px 32px;">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                          <tr>
                            <td align="center" style="background-color: #f0fdf4; border-radius: 12px; padding: 10px 18px; border: 1px solid #dcfce7;">
                              <span style="font-size: 20px; font-weight: 800; letter-spacing: 0.5px; color: #059669; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                                🛡️ Sec<span style="color: #0f172a;">App</span>
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td align="center" style="padding-top: 8px;">
                              <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; font-weight: 600;">Segurança do Trabalho</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Main Content -->
                    <tr>
                      <td style="padding: 0 40px 32px 40px;">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                          <tr>
                            <td>
                              <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 20px; font-weight: 700; text-align: center;">Sua Conta Foi Criada!</h2>

                              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 24px; color: #334155;">
                                Olá <strong>${name || 'Usuário'}</strong>,
                              </p>
                              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #334155;">
                                Seja muito bem-vindo ao <strong>SecApp</strong>. Um administrador configurou suas permissões no sistema e criou suas credenciais de acesso.
                              </p>

                              <div style="background-color: #f0fdf4; border: 1px solid #dcfce7; border-left: 4px solid #10b981; padding: 20px; border-radius: 12px; margin-bottom: 24px;">
                                <h3 style="margin: 0 0 12px 0; font-size: 13px; font-weight: 700; color: #065f46; text-transform: uppercase; letter-spacing: 0.5px;">📋 Informações Importantes</h3>
                                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 13px; color: #065f46; line-height: 22px;">
                                  ${link ? `
                                  <tr>
                                    <td style="padding: 4px 0; vertical-align: top; width: 24px;">🔑</td>
                                    <td style="padding: 4px 0;">Por favor, verifique seu e-mail clicando no botão abaixo para garantir que sua conta está ativa.</td>
                                  </tr>
                                  ` : ''}
                                  <tr>
                                    <td style="padding: 4px 0; vertical-align: top; width: 24px;">⚙️</td>
                                    <td style="padding: 4px 0;">Sua conta precisa de aprovação de um administrador para que todas as telas sejam liberadas.</td>
                                  </tr>
                                  ${type === 'welcome' ? `
                                  <tr>
                                    <td style="padding: 4px 0; vertical-align: top; width: 24px;">🔐</td>
                                    <td style="padding: 4px 0;">Sua senha padrão temporária é: <strong style="background-color: #ffffff; padding: 2px 6px; border-radius: 4px; border: 1px solid #a7f3d0; font-family: monospace; font-size: 14px; color: #047857;">Mudarsenha123</strong> (você deverá trocá-la no primeiro acesso).</td>
                                  </tr>
                                  ` : ''}
                                </table>
                              </div>

                              ${link ? `
                              <!-- CTA Button -->
                              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                                <tr>
                                  <td align="center">
                                    <a href="${link}" target="_blank" style="background-color: #059669; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(5, 150, 105, 0.2), 0 2px 4px -1px rgba(5, 150, 105, 0.1); border: 1px solid #047857;">
                                      Confirmar e Verificar Meu E-mail
                                    </a>
                                  </td>
                                </tr>
                              </table>
                              ` : ''}

                              <p style="margin: 0 0 12px 0; font-size: 14px; color: #475569; text-align: center;">
                                Você também pode acessar o sistema diretamente a qualquer momento através do link:
                              </p>
                              <div style="text-align: center; margin-bottom: 24px;">
                                 <a href="https://${req.headers.host}/login" style="color: #059669; font-weight: 700; text-decoration: underline; font-size: 14px;">https://${req.headers.host}/login</a>
                              </div>

                              <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 18px; text-align: center;">
                                Se você não esperava este convite ou não reconhece este sistema, por favor ignore este e-mail.
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f8fafc; padding: 32px 40px; border-top: 1px solid #f1f5f9; text-align: center;">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                          <tr>
                            <td align="center" style="color: #64748b; font-size: 12px; line-height: 18px;">
                              <p style="margin: 0 0 8px 0; font-weight: 600;">SecApp - Sistema de Gestão de Segurança do Trabalho</p>
                              <p style="margin: 0 0 16px 0;">Este é um e-mail automático gerado pelo sistema. Por favor, não responda diretamente a este e-mail.</p>
                              <p style="margin: 0; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #94a3b8; font-style: italic;">
                                Aviso de Confidencialidade: As informações contidas neste e-mail são confidenciais e destinadas exclusivamente ao destinatário.
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `;
      } else if (type === 'password_reset') {
        const MASTER_EMAILS = [
          'jacksonbjr@gmail.com',
          'jackson.junior@eldoradobrasil.com.br',
          'jackson.junior@eldoradobrasil.com'
        ];
        const emailLower = email.toLowerCase().trim();
        const isMaster = MASTER_EMAILS.includes(emailLower);

        // Calculate email hash using FNV-1a (matching standard hashEmailForSearch)
        let hash = 2166136261;
        for (let i = 0; i < emailLower.length; i++) {
          hash ^= emailLower.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        const emailHash = 'hash_' + (hash >>> 0).toString(16);

        const localApiKey = apiKey;
        const localDatabaseId = databaseId;
        const localProjectId = projectId;

        // Verify existence in users_public
        let userExistsInPublic = isMaster;
        let publicData: any = {};

        if (localApiKey && localProjectId) {
          const publicUrl = `https://firestore.googleapis.com/v1/projects/${localProjectId}/databases/${localDatabaseId}/documents/users_public/${emailHash}?key=${localApiKey}`;
          try {
            const publicRes = await fetch(publicUrl);
            if (publicRes.status === 200) {
              userExistsInPublic = true;
              const docJson: any = await publicRes.json();
              const fields = docJson.fields || {};
              publicData = {
                uid: fields.uid?.stringValue || "",
                role: fields.role?.stringValue || "viewer",
                status: fields.status?.stringValue || "approved"
              };
            }
          } catch (restErr) {
            console.error("[API send-custom-auth-email] Firestore REST API check error:", restErr);
          }
        }

        if (isMaster) {
          publicData = {
            uid: "EqJVew4PsDhRGGI2GM8C91UkQyp2",
            role: "admin",
            status: "approved"
          };
        }

        // If not in users_public and not master, they are not registered!
        if (!userExistsInPublic) {
          return res.status(400).json({ success: false, error: "Este e-mail não está cadastrado no sistema SecApp." });
        }

        // If the user is blocked or pending, do not allow password reset
        if (publicData.status === 'blocked' || publicData.status === 'pending') {
          return res.status(400).json({ success: false, error: "Sua conta está suspensa ou pendente de aprovação pelo administrador." });
        }

        // Check if user is registered in Firebase Auth. If not, auto-provision them.
        let authUserExists = false;
        if (apiKey) {
          try {
            const authUriUrl = `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${apiKey}`;
            const uriRes = await fetch(authUriUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                identifier: emailLower,
                continueUri: "http://localhost/"
              })
            });
            if (uriRes.ok) {
              const uriData: any = await uriRes.json();
              if (uriData.registered === true) {
                authUserExists = true;
              }
            }
          } catch (authErr) {
            console.error("[API send-custom-auth-email] Auth check error:", authErr);
          }

          // Auto-provision if they exist in Firestore but not in Auth yet
          if (!authUserExists) {
            console.log(`[API send-custom-auth-email] Auto-provisioning user for password reset: ${emailLower}`);
            try {
              const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
              const signUpRes = await fetch(signUpUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: emailLower,
                  password: "Mudarsenha123",
                  returnSecureToken: true
                })
              });
              if (signUpRes.ok) {
                authUserExists = true;
                const signUpData: any = await signUpRes.json();
                const newUid = signUpData.localId;
                
                // Heal UID in Firestore if necessary
                const currentDocId = publicData.uid || emailLower;
                if (currentDocId !== newUid) {
                  const getDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${currentDocId}?key=${apiKey}`;
                  const getDocRes = await fetch(getDocUrl);
                  let fieldsToSave: any = {};
                  if (getDocRes.status === 200) {
                    const docJson: any = await getDocRes.json();
                    fieldsToSave = docJson.fields || {};
                  }
                  fieldsToSave.mustChangePassword = { booleanValue: true };
                  fieldsToSave.emailHash = { stringValue: emailHash };
                  fieldsToSave.updatedAt = { timestampValue: new Date().toISOString() };

                  const createDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${newUid}?key=${apiKey}`;
                  await fetch(createDocUrl, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ fields: fieldsToSave })
                  });

                  // Also delete old if it was a different doc ID
                  if (currentDocId && currentDocId !== newUid && currentDocId !== emailLower) {
                    const deleteDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${currentDocId}?key=${apiKey}`;
                    await fetch(deleteDocUrl, { method: "DELETE" });
                  }

                  // Update users_public
                  const updatePublicUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users_public/${emailHash}?key=${apiKey}&updateMask.fieldPaths=uid`;
                  await fetch(updatePublicUrl, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      fields: {
                        uid: { stringValue: newUid }
                      }
                    })
                  });
                }
              }
            } catch (provErr) {
              console.error("[API send-custom-auth-email] Auto-provision failed during password reset:", provErr);
            }
          }
        }

        try {
          link = await getAuth().generatePasswordResetLink(email, actionCodeSettings);
        } catch (e: any) {
          console.warn("[API send-custom-auth-email] generatePasswordResetLink failed:", e);
          const isApiDisabled = e.message?.includes('identitytoolkit') || e.message?.includes('disabled') || e.message?.includes('used in project');
          return res.status(200).json({ 
            success: false, 
            useClientFallback: true,
            error: isApiDisabled 
              ? "A API Identity Toolkit está desativada no console Google Cloud. O administrador precisa ativá-la no painel do GCP."
              : "Serviço administrativo de redefinição de senha indisponível." 
          });
        }

        subject = "SecApp - Recuperação de Senha";
        html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Recuperação de Senha - SecApp</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: #1e293b;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <!-- Card Container -->
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05); border: 1px solid #e2e8f0;">
                    
                    <!-- Header Accent Bar -->
                    <tr>
                      <td style="background-color: #059669; height: 6px;"></td>
                    </tr>

                    <!-- Header Logo / Brand -->
                    <tr>
                      <td align="center" style="padding: 32px 32px 24px 32px;">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                          <tr>
                            <td align="center" style="background-color: #f0fdf4; border-radius: 12px; padding: 10px 18px; border: 1px solid #dcfce7;">
                              <span style="font-size: 20px; font-weight: 800; letter-spacing: 0.5px; color: #059669; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                                🛡️ Sec<span style="color: #0f172a;">App</span>
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td align="center" style="padding-top: 8px;">
                              <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; font-weight: 600;">Segurança do Trabalho</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Main Content -->
                    <tr>
                      <td style="padding: 0 40px 32px 40px;">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                          <tr>
                            <td>
                              <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 20px; font-weight: 700; text-align: center;">Recuperação de Senha</h2>

                              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 24px; color: #334155; text-align: center;">
                                Olá, recebemos uma solicitação para redefinir a senha associada à sua conta no sistema <strong>SecApp</strong>.
                              </p>

                              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #334155; text-align: center;">
                                Para prosseguir e escolher uma nova senha de acesso, clique no botão seguro abaixo:
                              </p>

                              <!-- CTA Button -->
                              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                                <tr>
                                  <td align="center">
                                    <a href="${link}" target="_blank" style="background-color: #059669; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(5, 150, 105, 0.2), 0 2px 4px -1px rgba(5, 150, 105, 0.1); border: 1px solid #047857;">
                                      Redefinir Senha de Acesso
                                    </a>
                                  </td>
                                </tr>
                              </table>

                              <div style="background-color: #f8fafc; border-left: 4px solid #94a3b8; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
                                <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #475569;">Dica de Segurança:</p>
                                <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 20px;">
                                  <li>Este link de redefinição de senha é de uso único e expirará em breve por motivos de segurança.</li>
                                  <li>Se você não realizou esta solicitação, ignore este e-mail. Nenhuma ação adicional é necessária e sua senha atual continuará segura.</li>
                                </ul>
                              </div>

                              <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 20px; text-align: center;">
                                Se houver problemas ao clicar no botão, copie e cole o link abaixo em seu navegador:
                                <br>
                                <a href="${link}" style="color: #059669; word-break: break-all; text-decoration: underline; font-family: monospace; font-size: 12px;">${link}</a>
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f8fafc; padding: 32px 40px; border-top: 1px solid #f1f5f9; text-align: center;">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                          <tr>
                            <td align="center" style="color: #64748b; font-size: 12px; line-height: 18px;">
                              <p style="margin: 0 0 8px 0; font-weight: 600;">SecApp - Sistema de Gestão de Segurança do Trabalho</p>
                              <p style="margin: 0 0 16px 0;">Este é um e-mail automático gerado pelo sistema. Por favor, não responda diretamente a este e-mail.</p>
                              <p style="margin: 0; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #94a3b8; font-style: italic;">
                                Aviso de Confidencialidade: As informações contidas neste e-mail são confidenciais e destinadas exclusivamente ao destinatário.
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `;
      }

      await transporter.sendMail({
        from: `"SecApp - Suporte" <${gmailUser}>`,
        to: email,
        subject: subject,
        html: html
      });

      res.json({ success: true, sender: gmailUser });
    } catch (err: any) {
      console.error("[API] Custom email error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API Route to retrieve user from secondary/primary Firebase Auth by email to repair missing Firestore profiles
  app.post("/api/admin/get-auth-user", requireAdmin, async (req, res) => {
    try {
      if (getApps().length === 0) {
        return res.status(500).json({ success: false, error: "Serviço de autenticação administratória indisponível (Firebase não inicializado)." });
      }
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ success: false, error: "E-mail não informado." });
      }

      console.log(`[API] Looking up existing Auth user for: ${email}`);
      let userRecord;
      try {
        userRecord = await getAuth().getUserByEmail(email.toLowerCase().trim());
      } catch (error: any) {
        const errMessage = error?.message || String(error);
        if (errMessage.includes("PERMISSION_DENIED") || errMessage.includes("permissions") || errMessage.includes("not been used")) {
          const emailLower = email.toLowerCase().trim();
          let hash = 0;
          for (let i = 0; i < emailLower.length; i++) {
            hash = (hash << 5) - hash + emailLower.charCodeAt(i);
            hash |= 0;
          }
          const fakeUid = "sandbox_user_" + Math.abs(hash).toString(36);
          return res.json({
            success: true,
            uid: fakeUid,
            displayName: emailLower.split('@')[0],
            email: emailLower
          });
        }
        throw error;
      }
      
      return res.json({ 
        success: true, 
        uid: userRecord.uid, 
        displayName: userRecord.displayName || "", 
        email: userRecord.email 
      });
    } catch (error: any) {
      console.error("[API] Error looking up auth user:", error);
      if (error.message?.includes('identitytoolkit.googleapis.com') || error.message?.includes('Identity Toolkit')) {
        return res.json({ 
          success: false, 
          code: 'auth/api-disabled', 
          error: "A API do Firebase Identity Toolkit está desativa ou pendente no Console do Google Cloud. Acesse este endereço para ativar no seu projeto: https://console.developers.google.com/apis/api/identitytoolkit.googleapis.com/overview?project=404345482948" 
        });
      }
      if (error.code === 'auth/user-not-found' || error.message?.includes('user-not-found')) {
        return res.json({ success: false, code: 'auth/user-not-found', error: "Usuário não encontrado no Authentication." });
      }
      return res.json({ success: false, error: error.message || "Erro interno ao buscar usuário" });
    }
  });

  // Helper to decrypt values on the server
  const decryptValueNode = (value: string | null | undefined): string => {
    if (!value) return '';
    const str = String(value).trim();

    // 1. Decrypt AES-GCM
    const upperStr = str.toUpperCase();
    if (upperStr.startsWith('__ENC_GCM__')) {
      try {
        let rawPayload = str.substring(11); // Remove prefix (always 11 chars)
        // Defensive fix: replace space characters with '+' to heal URL-encoding issues
        rawPayload = rawPayload.replace(/ /g, '+');
        const combined = Buffer.from(rawPayload, 'base64');

        if (combined.length < 12) {
          return str;
        }

        const iv = combined.subarray(0, 12);
        const ciphertextAndAuthTag = combined.subarray(12);
        
        if (ciphertextAndAuthTag.length < 16) {
          return str;
        }
        const ciphertext = ciphertextAndAuthTag.subarray(0, ciphertextAndAuthTag.length - 16);
        const authTag = ciphertextAndAuthTag.subarray(ciphertextAndAuthTag.length - 16);

        const keysToTry = Array.from(new Set([
          process.env.VITE_ENCRYPTION_KEY,
          'Js29082011@',
          'EldoradoSSTSecureKey2026',
          'EldoradoMaster@2026',
          'Js29082011',
          'EldoradoSST',
          'eldorado',
          'EldoradoMaster',
          'Eldorado'
        ].filter(Boolean))) as string[];

        const tryDecrypt = (secretKey: string) => {
          const keyHash = crypto.createHash('sha256').update(secretKey).digest();
          const decipher = crypto.createDecipheriv('aes-256-gcm', keyHash, iv);
          decipher.setAuthTag(authTag);
          let decrypted = decipher.update(ciphertext, undefined, 'utf8');
          decrypted += decipher.final('utf8');
          return decrypted;
        };

        let decryptedText: string | null = null;
        let lastError: any = null;

        for (const keyCandidate of keysToTry) {
          try {
            decryptedText = tryDecrypt(keyCandidate);
            if (decryptedText !== null) {
              return decryptedText;
            }
          } catch (err) {
            lastError = err;
          }
        }

        throw lastError || new Error('All decryption keys failed');
      } catch (error) {
        console.error('[Node Crypto] AES-GCM Decryption error:', error);
        return str;
      }
    }

    // 2. Fallback to legacy RC4 decryption
    if (upperStr.startsWith('__ENC__')) {
      try {
        const payloadRaw = str.substring(7); // Remove prefix (always 7 chars)
        const payload = Buffer.from(payloadRaw, 'base64').toString('utf8');
        
        const colonIndex = payload.indexOf(':');
        if (colonIndex === -1) return str;
        
        const salt = payload.substring(0, colonIndex);
        const encryptedBase64 = payload.substring(colonIndex + 1);
        const encryptedData = Buffer.from(encryptedBase64, 'base64').toString('binary');

        const rc4Decrypt = (key: string, input: string): string => {
          const s = new Uint8Array(256);
          for (let i = 0; i < 256; i++) s[i] = i;
          let j = 0;
          for (let i = 0; i < 256; i++) {
            j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
            const temp = s[i];
            s[i] = s[j];
            s[j] = temp;
          }
          let i = 0;
          j = 0;
          let output = '';
          for (let k = 0; k < input.length; k++) {
            i = (i + 1) % 256;
            j = (j + s[i]) % 256;
            const temp = s[i];
            s[i] = s[j];
            s[j] = temp;
            const keystreamByte = s[(s[i] + s[j]) % 256];
            output += String.fromCharCode(input.charCodeAt(k) ^ keystreamByte);
          }
          return output;
        };

        const tryDecryptWithKey = (k: string): string => {
          const saltedKey = k + salt;
          return rc4Decrypt(saltedKey, encryptedData);
        };

        const envKey = process.env.VITE_ENCRYPTION_KEY;
        let decrypted = '';
        const isGarbage = (sVal: string): boolean => {
          if (!sVal) return true;
          const allowedRegex = /^[a-zA-Z0-9\s@\.\-_'’áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ]+$/;
          return !allowedRegex.test(sVal);
        };

        if (envKey) decrypted = tryDecryptWithKey(envKey);
        if (!envKey || isGarbage(decrypted)) {
          const fallbackDecrypted = tryDecryptWithKey('EldoradoSSTSecureKey2026');
          if (!isGarbage(fallbackDecrypted)) {
            decrypted = fallbackDecrypted;
          } else if (!decrypted) {
            decrypted = fallbackDecrypted;
          }
        }
        return decrypted || str;
      } catch (err) {
        console.error('[Node Crypto] Legacy RC4 Decryption error:', err);
        return str;
      }
    }

    return str;
  };

  // API Route to check if an email already exists in either Firebase Auth or Firestore
  app.post("/api/auth/check-email", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ exists: false, error: "E-mail não informado." });
      }

      const emailLower = email.toLowerCase().trim();

      // Master accounts always bypass and are allowed
      const MASTER_EMAILS = [
        'jacksonbjr@gmail.com',
        'jackson.junior@eldoradobrasil.com.br',
        'jackson.junior@eldoradobrasil.com'
      ];
      if (MASTER_EMAILS.includes(emailLower)) {
        return res.json({ exists: true, reason: 'master' });
      }

      // Calculate email hash using FNV-1a (matching standard hashEmailForSearch)
      let hash = 2166136261;
      for (let i = 0; i < emailLower.length; i++) {
        hash ^= emailLower.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      const emailHash = 'hash_' + (hash >>> 0).toString(16);

      // 1. Check in users_public collection via REST API (Highly secure, fast & immune to Admin SDK restriction)
      try {
        const localApiKey = apiKey;
        const localDatabaseId = databaseId;
        const localProjectId = projectId;
        if (localApiKey && localProjectId) {
          const url = `https://firestore.googleapis.com/v1/projects/${localProjectId}/databases/${localDatabaseId}/documents/users_public/${emailHash}?key=${localApiKey}`;
          const response = await fetch(url);
          if (response.status === 200) {
            console.log(`[API check-email] Found user in users_public: ${emailHash}`);
            return res.json({ exists: true, reason: 'users_public' });
          }
        }
      } catch (restErr) {
        console.error("[API check-email] Firestore REST API check error:", restErr);
      }

      // 2. Check in Firebase Auth as fallback
      let authUserExists = false;
      try {
        const authUser = await getAuth().getUserByEmail(emailLower);
        if (authUser) {
          authUserExists = true;
        }
      } catch (authErr: any) {
        const authErrMessage = authErr?.message || String(authErr);
        // Fallback to Firebase REST API lookup if Admin SDK throws permission error or fails
        try {
          const localApiKey = apiKey;
          if (localApiKey) {
            const url = `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${localApiKey}`;
            const restRes = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                identifier: emailLower,
                continueUri: "http://localhost/"
              })
            });
            if (restRes.ok) {
              const restData: any = await restRes.json();
              if (restData.registered === true) {
                authUserExists = true;
              }
            }
          }
        } catch (restErr) {
          console.error("[API check-email] Auth REST API fallback error:", restErr);
        }

        if (authErr.code !== 'auth/user-not-found' && !authErrMessage.includes('user-not-found') && !authErrMessage.includes("PERMISSION_DENIED")) {
          console.error("[API] Auth check error:", authErr);
        }
      }

      if (authUserExists) {
        return res.json({ exists: true, reason: 'auth' });
      }

      // 3. Fallback check directly in Firestore users collection using Admin SDK
      try {
        const dbFirestore = getFirestore(undefined, (firebaseConfig as any).firestoreDatabaseId || process.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-0394a074-0ded-48a0-9733-51828b2a3a52");
        let usersQuery = await dbFirestore.collection('users').where('emailHash', '==', emailHash).limit(1).get();
        
        if (usersQuery.empty) {
          usersQuery = await dbFirestore.collection('users').where('email', '==', emailLower).limit(1).get();
        }
        
        if (usersQuery.empty) {
          usersQuery = await dbFirestore.collection('users').where('email', '==', email).limit(1).get();
        }

        if (!usersQuery.empty) {
          return res.json({ exists: true, reason: 'firestore' });
        }

        // 4. Fallback scan as last resort
        console.log(`[API check-email] Quick lookup missed for ${emailLower}. Executing fallback scan of users...`);
        const allUsersSnap = await dbFirestore.collection('users').get();
        for (const doc of allUsersSnap.docs) {
          const data = doc.data();
          if (data && data.email) {
            try {
              const decryptedEmail = decryptValueNode(data.email).toLowerCase().trim();
              if (decryptedEmail === emailLower) {
                console.log(`[API check-email] Matched user in fallback scan: ID ${doc.id}`);
                try {
                  await doc.ref.update({ emailHash: emailHash });
                  console.log(`[API check-email] Automatically healed emailHash for user ${doc.id}`);
                } catch (updateErr) {
                  console.error(`[API check-email] Error healing emailHash for user ${doc.id}:`, updateErr);
                }
                return res.json({ exists: true, reason: 'firestore-scan-fallback' });
              }
            } catch (decErr) {
              // Ignore
            }
          }
        }
      } catch (firestoreErr: any) {
        // Silent catch for permission denied
      }

      return res.json({ exists: false });
    } catch (error: any) {
      console.error("[API] Error in check-email:", error);
      return res.status(500).json({ exists: false, error: error.message || "Erro interno ao verificar e-mail" });
    }
  });

  // API Route to auto-provision a user in Firebase Auth if they exist in Firestore and have a status that is not blocked
  app.post("/api/auth/auto-provision", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(200).json({ success: false, error: "E-mail não informado." });
      }

      const emailLower = email.toLowerCase().trim();
      
      const MASTER_EMAILS = [
        'jacksonbjr@gmail.com',
        'jackson.junior@eldoradobrasil.com.br',
        'jackson.junior@eldoradobrasil.com'
      ];
      const isMaster = MASTER_EMAILS.includes(emailLower);

      // Calculate email hash using FNV-1a (matching standard hashEmailForSearch)
      let hash = 2166136261;
      for (let i = 0; i < emailLower.length; i++) {
        hash ^= emailLower.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      const emailHash = 'hash_' + (hash >>> 0).toString(16);

      const localApiKey = apiKey;
      const localDatabaseId = databaseId;
      const localProjectId = projectId;

      if (!localApiKey || !localProjectId) {
        return res.status(200).json({ success: false, error: "Firebase credentials missing on server." });
      }

      // Step A: Check /users_public/{emailHash} via REST API (works across project boundaries)
      const publicUrl = `https://firestore.googleapis.com/v1/projects/${localProjectId}/databases/${localDatabaseId}/documents/users_public/${emailHash}?key=${localApiKey}`;
      const publicRes = await fetch(publicUrl);
      
      if (publicRes.status !== 200 && !isMaster) {
        return res.status(200).json({ success: false, code: 'user-not-found', error: "Este e-mail não está cadastrado no sistema. Solicite acesso ao administrador." });
      }

      let publicData: any = {};
      if (publicRes.status === 200) {
        const docJson: any = await publicRes.json();
        const fields = docJson.fields || {};
        publicData = {
          uid: fields.uid?.stringValue || "",
          role: fields.role?.stringValue || "viewer",
          status: fields.status?.stringValue || "approved"
        };
      } else if (isMaster) {
        publicData = {
          uid: "EqJVew4PsDhRGGI2GM8C91UkQyp2",
          role: "admin",
          status: "approved"
        };
      }

      if (publicData.status === 'blocked' || publicData.status === 'pending') {
        return res.status(200).json({ success: false, code: 'user-blocked', error: "Sua conta está suspensa ou pendente de aprovação pelo administrador." });
      }

      // Step B: Check if already registered in Firebase Auth using REST API createAuthUri
      let authUserExists = false;
      try {
        const authUriUrl = `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${localApiKey}`;
        const uriRes = await fetch(authUriUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identifier: emailLower,
            continueUri: "http://localhost/"
          })
        });
        if (uriRes.ok) {
          const uriData: any = await uriRes.json();
          if (uriData.registered === true) {
            authUserExists = true;
          }
        }
      } catch (authErr) {
        console.error("[API auto-provision] Auth check error:", authErr);
      }

      if (authUserExists) {
        // Already exists in Auth, they can just login
        return res.status(200).json({ success: true, message: "Usuário já registrado no Auth." });
      }

      // Step C: If not in Auth, sign them up with default password
      console.log(`[API auto-provision] Auto-provisioning user via REST Auth API: ${emailLower}`);
      const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${localApiKey}`;
      const signUpRes = await fetch(signUpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailLower,
          password: "Mudarsenha123",
          returnSecureToken: true
        })
      });

      const signUpData: any = await signUpRes.json();
      if (!signUpRes.ok) {
        const errMsg = signUpData.error?.message;
        if (errMsg === "EMAIL_EXISTS") {
          return res.status(200).json({ success: true, message: "Usuário já registrado no Auth." });
        } else if (errMsg?.includes("blocked") || signUpData.error?.code === 400) {
          // Provide a detailed, ultra-clear explanation on how to resolve the SignUp block
          return res.status(200).json({ 
            success: false, 
            error: `O cadastro automático de novos usuários está bloqueado pelas políticas ou configurações do seu Firebase/Google Cloud.

Para solucionar isso de uma vez por todas, o administrador do projeto precisa realizar estes 2 passos simples:

1️⃣ Ativar o Provedor de E-mail/Senha:
No console do Firebase (https://console.firebase.google.com/), vá em "Authentication" > aba "Sign-in method" > clique em "E-mail/senha" e garanta que o provedor esteja como HABILITADO (Ativado).

2️⃣ Ajustar as Restrições da Chave de API no Google Cloud:
No Console do Google Cloud (https://console.cloud.google.com/), acesse seu projeto, vá em "APIs e Serviços" > "Credenciais", clique na sua Chave de API (geralmente iniciada por "AIzaSy" ou chamada "Browser key") e verifique a seção "Restrições de API" (API restrictions).
Se a chave estiver restrita, certifique-se de adicionar a "Identity Toolkit API" na lista de APIs permitidas. Caso contrário, qualquer tentativa de criar usuários por e-mail será totalmente bloqueada pelo Google Cloud!` 
          });
        } else {
          return res.status(200).json({ success: false, error: errMsg || "Falha ao registrar usuário no sistema." });
        }
      }

      const newUid = signUpData.localId;
      console.log(`[API auto-provision] Successfully registered user: ${emailLower} with UID: ${newUid}`);

      // Step D: Handle migrating document ID in Firestore if it was stored as email instead of UID
      const currentDocId = publicData.uid || emailLower;
      if (currentDocId !== newUid) {
        console.log(`[API auto-provision] Healing document ID in Firestore from ${currentDocId} to ${newUid}`);
        
        // Fetch current user document
        const getDocUrl = `https://firestore.googleapis.com/v1/projects/${localProjectId}/databases/${localDatabaseId}/documents/users/${currentDocId}?key=${localApiKey}`;
        const getDocRes = await fetch(getDocUrl);
        
        let fieldsToSave: any = {};
        if (getDocRes.status === 200) {
          const docJson: any = await getDocRes.json();
          fieldsToSave = docJson.fields || {};
        }

        // Add or ensure mustChangePassword: true
        fieldsToSave.mustChangePassword = { booleanValue: true };
        fieldsToSave.emailHash = { stringValue: emailHash };
        fieldsToSave.updatedAt = { timestampValue: new Date().toISOString() };

        // Create new document at users/{newUid}
        const createDocUrl = `https://firestore.googleapis.com/v1/projects/${localProjectId}/databases/${localDatabaseId}/documents/users/${newUid}?key=${localApiKey}`;
        await fetch(createDocUrl, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields: fieldsToSave })
        });

        // Update the users_public document to point to the new UID
        const updatePublicUrl = `https://firestore.googleapis.com/v1/projects/${localProjectId}/databases/${localDatabaseId}/documents/users_public/${emailHash}?key=${localApiKey}`;
        await fetch(updatePublicUrl, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: {
              exists: { booleanValue: true },
              uid: { stringValue: newUid },
              role: { stringValue: publicData.role || "viewer" },
              status: { stringValue: publicData.status || "approved" },
              updatedAt: { timestampValue: new Date().toISOString() }
            }
          })
        });

        // Delete the old users/{currentDocId} document if it was different
        if (currentDocId && currentDocId !== newUid) {
          const deleteDocUrl = `https://firestore.googleapis.com/v1/projects/${localProjectId}/databases/${localDatabaseId}/documents/users/${currentDocId}?key=${localApiKey}`;
          await fetch(deleteDocUrl, { method: "DELETE" });
        }
      } else {
        // If they already have the correct UID, just make sure mustChangePassword is true
        const getDocUrl = `https://firestore.googleapis.com/v1/projects/${localProjectId}/databases/${localDatabaseId}/documents/users/${newUid}?key=${localApiKey}`;
        const getDocRes = await fetch(getDocUrl);
        if (getDocRes.status === 200) {
          const docJson: any = await getDocRes.json();
          const fields = docJson.fields || {};
          fields.mustChangePassword = { booleanValue: true };
          fields.updatedAt = { timestampValue: new Date().toISOString() };

          await fetch(getDocUrl, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fields })
          });
        }
      }

      return res.status(200).json({ success: true, message: "Usuário provisionado com sucesso para primeiro acesso." });
    } catch (error: any) {
      console.error("[API] Error in auto-provision:", error);
      return res.status(200).json({ success: false, error: error.message || "Erro interno ao verificar primeiro acesso" });
    }
  });

  // API Route to process DDS raw data using Gemini API
  app.post("/api/gemini/process-dds", requireAuth, async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ success: false, error: "Texto do relatório não informado." });
      }

      if (!ai) {
        return res.status(200).json({ 
          success: false, 
          error: "O serviço de Inteligência Artificial não está disponível porque a chave de API (GEMINI_API_KEY) não foi fornecida nas configurações." 
        });
      }

      const prompt = `Você é o motor de inteligência e processamento de dados de um aplicativo de gerenciamento de Segurança do Trabalho. Sua função é receber dados brutos (seja em texto, relatórios, transcrições ou planilhas) sobre a realização do Diálogo Diário de Segurança (DDS) e transformá-los em uma estrutura de dados padronizada (JSON) seguindo a lógica exata de uma planilha de controle de participação.

DADOS BRUTOS RECEBIDOS:
"""
${text}
"""

DIRETRIZES DE PROCESSAMENTO E LÓGICA:
1. Extração de Metadados:
   - Identifique e isole as seguintes informações do DDS:
     - executante: Nome de quem conduziu (ex: Danilo, Danilo Souza).
     - turno: Letra do turno ou identificador (ex: Turno C, Turno 1, Turno 2, Turno 3).
     - assunto: Tema abordado (ex: Movimentação de Carga, Prevenção de Quedas).
     - data: Data do evento (DD/MM/AAAA).
     - horario: Hora realizada (HH:MM). Se não informado, deixe em branco ou calcule um provável com base no turno.
     - area: Local aplicável (ex: Secagem / Enfardamento, Qualidade).

2. Processamento de Participantes e Avaliação:
   - Para cada colaborador listado, verifique o status da sua "Avaliação de Reação":
     - Marque o status correspondente: 'Bom', 'Regular', 'Ruim' ou 'Ausente'.
     - Contabilize os totais de cada avaliação para gerar o indicador de reação da equipe.

3. Lógica de Cálculo dos Indicadores (KPIs):
   - Acompanhe rigorosamente as fórmulas da planilha original para preencher os indicadores:
     - total_participantes: Soma de colaboradores presentes (que receberam avaliação Bom, Regular ou Ruim).
     - total_previsto: Quantidade total de funcionários que deveriam estar presentes no turno naquele dia (ex: contagem de presentes + ausentes, ou um número estipulado se mencionado).
     - idds_do_dia:
       - Se realizado conforme o esperado: 1.0 (100%).
       - Se não realizado ou abaixo da meta: Calcular a razão proporcional com base na meta estabelecida (Meta padrão de assiduidade/realização: 0.75).
       - Dias identificados como "F" (Folga/Feriado) na escala não devem penalizar o IDDS geral.

Retorne rigorosamente no formato de JSON schema especificado.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              metadados: {
                type: Type.OBJECT,
                properties: {
                  executante: { type: Type.STRING },
                  turno: { type: Type.STRING },
                  assunto: { type: Type.STRING },
                  data: { type: Type.STRING },
                  horario: { type: Type.STRING },
                  area: { type: Type.STRING },
                },
                required: ["executante", "turno", "assunto", "data"],
              },
              participantes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    nome: { type: Type.STRING },
                    avaliacao: { type: Type.STRING },
                  },
                  required: ["nome", "avaliacao"],
                },
              },
              indicadores_diarios: {
                type: Type.OBJECT,
                properties: {
                  total_participantes: { type: Type.INTEGER },
                  total_previsto: { type: Type.INTEGER },
                  idds_do_dia: { type: Type.NUMBER },
                },
                required: ["total_participantes", "total_previsto", "idds_do_dia"],
              },
              controle_mensal_referencia: {
                type: Type.OBJECT,
                properties: {
                  mes_ano: { type: Type.STRING },
                  status_dia_na_escala: { type: Type.STRING },
                },
              },
            },
            required: ["metadados", "participantes", "indicadores_diarios"],
          },
        },
      });

      if (!response.text) {
        return res.status(200).json({ success: false, error: "A Inteligência Artificial não gerou um resultado legível." });
      }

      const resultObj = JSON.parse(response.text.trim());
      return res.json({ success: true, result: resultObj });
    } catch (err: any) {
      console.error("[API Gemini Tool] Error processing DDS:", err);
      return res.status(500).json({ success: false, error: err.message || "Erro de processamento com a IA." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // Dynamic SPA catch-all router for development mode to resolve potential 404s on subroute updates/refreshes
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      // Skip API, assets, or chunks/HMR/modules requests which must be handled on fallback or next()
      if (url.startsWith("/api") || url.includes(".") || url.startsWith("/@") || url.includes("node_modules")) {
        return next();
      }
      try {
        const htmlTemplate = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
        const transformedHtml = await vite.transformIndexHtml(url, htmlTemplate);
        res.status(200).set({ "Content-Type": "text/html" }).end(transformedHtml);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
