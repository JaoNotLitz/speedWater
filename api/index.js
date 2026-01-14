const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors'); // Importando o CORS
require('dotenv').config();

const app = express();

// Configurações Globais
app.use(cors()); // Libera acesso para o Front-end
app.use(express.json());

// Configuração da conexão com o Supabase (Pooler)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Importante para o Supabase não barrar a Vercel
  }
});

// 1. Criar Usuário (Sign Up)
app.post('/signup', async (req, res) => {
  const { userName, profilePictureURL, password, recoveryEmail } = req.body;
  
  try {
    // Criptografia de mão única (Salt de 10 rounds)
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const query = `
      INSERT INTO users (user_name, profile_picture_url, password, recovery_email)
      VALUES ($1, $2, $3, $4) RETURNING id;
    `;
    
    const result = await pool.query(query, [userName, profilePictureURL, hashedPassword, recoveryEmail]);
    res.status(201).json({ message: "Usuário criado!", id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Login (Entrar no sistema)
app.post('/login', async (req, res) => {
  const { userName, password } = req.body;

  try {
    // Busca o usuário
    const query = 'SELECT * FROM users WHERE user_name = $1';
    const result = await pool.query(query, [userName]);

    if (result.rowCount === 0) {
      return res.status(400).json({ error: "Usuário não encontrado" });
    }

    const user = result.rows[0];

    // Verifica a senha
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: "Senha incorreta" });
    }

    // Retorna dados seguros (sem a senha)
    res.json({
      message: "Login realizado!",
      user: {
        id: user.id,
        userName: user.user_name,
        profilePictureURL: user.profile_picture_url,
        dailyWater: user.daily_water,
        weekWater: user.week_water,
        totalWater: user.total_water
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Adicionar Água
app.patch('/add-water/:userName', async (req, res) => {
  const { userName } = req.params;
  const { amount } = req.body; // Ex: 250
  
  try {
    const query = `
      UPDATE users 
      SET daily_water = daily_water + $1,
          week_water = week_water + $1,
          total_water = total_water + $1
      WHERE user_name = $2
      RETURNING daily_water, week_water, total_water;
    `;
    
    const result = await pool.query(query, [amount, userName]);
    if (result.rowCount === 0) return res.status(404).send("Usuário não encontrado");
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Atualizar Foto de Perfil (Versão Blindada)
app.patch('/update-profile/:userName', async (req, res) => {
  try {
    // 1. Decodifica o nome (Jo%C3%A3o -> João)
    const userName = decodeURIComponent(req.params.userName);
    const { profilePictureURL } = req.body;
    
    // Log para a gente ver na Vercel se funcionou
    console.log(`Tentando atualizar foto de: ${userName}`);

    const query = `
      UPDATE users 
      SET profile_picture_url = $1
      WHERE user_name = $2
      RETURNING id, user_name, profile_picture_url;
    `;
    
    const result = await pool.query(query, [profilePictureURL, userName]);
    
    if (result.rowCount === 0) {
      console.log("Usuário não encontrado no DB");
      return res.status(404).send("Usuário não encontrado");
    }
    
    res.json({ message: "Foto atualizada!", user: result.rows[0] });
  } catch (err) {
    console.error("Erro no update:", err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Placar de Líderes (Scoreboard)
app.get('/scoreboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT user_name, profile_picture_url, daily_water, week_water, total_water 
      FROM users 
      ORDER BY total_water DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Zerar Dia (CRON Job)
app.post('/reset-daily', async (req, res) => {
  try {
    await pool.query('UPDATE users SET daily_water = 0');
    res.json({ message: "Daily water resetado para todos!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Zerar Semana (CRON Job)
app.post('/reset-week', async (req, res) => {
  try {
    await pool.query('UPDATE users SET week_water = 0');
    res.json({ message: "Week water resetado para todos!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Exporta o app para a Vercel
module.exports = app;

// Servidor Local
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}