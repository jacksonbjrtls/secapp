import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
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
const projectId = (firebaseConfig as any).projectId || process.env.FIREBASE_PROJECT_ID;
if (!projectId) {
  console.warn("⚠️ ALERTA CRÍTICO: O ID do Projeto Firebase (FIREBASE_PROJECT_ID) não foi encontrado no firebase-applet-config.json ou nas variáveis de ambiente. As funções de sincronização de credenciais de usuários em lote não funcionarão até que uma das variáveis seja devidamente configurada.");
} else {
  try {
    if (getApps().length === 0) {
      initializeApp({
        projectId: projectId,
      });
      console.log(`[Firebase Admin] Inicializado com sucesso para o projeto: ${projectId}`);
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
    console.error("Token verification failed:", error);
    return res.status(401).json({ error: "Não autorizado" });
  }
};

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
      const dbFirestore = getFirestore(undefined, (firebaseConfig as any).firestoreDatabaseId || process.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-0394a074-0ded-48a0-9733-51828b2a3a52");
      const userDoc = await dbFirestore.collection("users").doc(uid).get();

      if (!userDoc.exists) {
        return res.status(403).json({ error: "Acesso negado: Perfil não encontrado" });
      }

      const userData = userDoc.data();
      const role = userData?.role;
      const status = userData?.status;

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
          <div style="font-family: sans-serif; padding: 20px; color: #334155; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px;">
            <div style="text-align: center; border-bottom: 2px solid #059669; padding-bottom: 15px; margin-bottom: 20px;">
              <h1 style="color: #059669; margin: 0; font-size: 24px;">Novo Cadastro Realizado</h1>
            </div>
            
            <p>Olá Administrador,</p>
            <p>Um novo usuário acaba de se cadastrar no <strong>SecApp</strong> e aguarda aprovação de acesso.</p>
            
            <div style="background: #f8fafc; padding: 15px; border-radius: 10px; border: 1px solid #e2e8f0; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Nome:</strong> ${displayName || 'Não informado'}</p>
              <p style="margin: 5px 0;"><strong>E-mail:</strong> ${userEmail}</p>
              <p style="margin: 5px 0;"><strong>Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>
            </div>

            <p>Você pode gerenciar os acessos através do <strong>Painel Administrativo</strong> no sistema.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://${req.headers.host}/admin" style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Acessar Painel Admin</a>
            </div>

            <p style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 12px; color: #94a3b8; text-align: center;">
              Este é um e-mail automático enviado pelo <strong>SecApp</strong>.
            </p>
          </div>
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
        url: `https://${req.headers.host}/login`,
      };

      if (type === 'verification' || type === 'welcome') {
        try {
          link = await getAuth().generateEmailVerificationLink(email, actionCodeSettings);
        } catch (e) {
          console.warn("Could not generate verification link (user might not exist yet or already verified):", e);
        }
        
        subject = "SecApp - Bem-vindo e Verificação de E-mail";
        html = `
          <div style="font-family: sans-serif; padding: 20px; color: #334155; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px;">
            <div style="text-align: center; border-bottom: 2px solid #059669; padding-bottom: 15px; margin-bottom: 20px;">
              <h1 style="color: #059669; margin: 0; font-size: 24px;">Bem-vindo ao SecApp</h1>
            </div>
            
            <p>Olá <strong>${name || 'Usuário'}</strong>,</p>
            <p>Sua conta foi criada no sistema <strong>SecApp</strong>.</p>
            
            <div style="background: #f0fdf4; padding: 15px; border-radius: 10px; border: 1px solid #dcfce7; margin: 20px 0;">
              <p style="margin-top: 0;"><strong>Ações necessárias:</strong></p>
              <ol style="margin-bottom: 0;">
                ${link ? `<li>Clique no botão abaixo para verificar seu e-mail.</li>` : ''}
                <li>Aguarde a aprovação de um administrador para acessar todas as funções.</li>
                ${type === 'welcome' ? `<li>Sua senha padrão temporária é: <strong>Mudar@123</strong></li>` : ''}
              </ol>
            </div>

            ${link ? `
            <div style="text-align: center; margin: 30px 0;">
              <a href="${link}" style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Verificar E-mail</a>
            </div>
            ` : ''}

            <p>Você também pode acessar o sistema diretamente:</p>
            <div style="text-align: center; margin: 15px 0;">
               <a href="https://${req.headers.host}/login" style="color: #059669; font-weight: bold; text-decoration: underline;">https://${req.headers.host}/login</a>
            </div>

            <p style="font-size: 12px; color: #64748b; margin-top: 30px;">Se você não solicitou este cadastro, por favor ignore este e-mail.</p>
          </div>
        `;
      } else if (type === 'password_reset') {
        try {
          link = await getAuth().generatePasswordResetLink(email, actionCodeSettings);
        } catch (e) {
          return res.status(400).json({ success: false, error: "Usuário não encontrado." });
        }

        subject = "SecApp - Recuperação de Senha";
        html = `
          <div style="font-family: sans-serif; padding: 20px; color: #334155; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px;">
            <div style="text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 15px; margin-bottom: 20px;">
              <h1 style="color: #3b82f6; margin: 0; font-size: 24px;">Recuperação de Senha</h1>
            </div>
            
            <p>Olá,</p>
            <p>Recebemos uma solicitação para redefinir a senha da sua conta no <strong>SecApp</strong>.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${link}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Redefinir Minha Senha</a>
            </div>

            <p style="font-size: 12px; color: #64748b;">Este link de redefinição expirará em breve. Se você não solicitou isso, pode ignorar este e-mail com segurança.</p>
          </div>
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
      const userRecord = await getAuth().getUserByEmail(email.toLowerCase().trim());
      
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
