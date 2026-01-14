const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
app.use(express.json());

// Configuração da conexão com o Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Importante para o Supabase não barrar a Vercel
  }
});

// 1. Criar Usuário
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

// 2. dailyAdder - Adicionar água
app.patch('/add-water/:userName', async (req, res) => {
  const { userName } = req.params;
  const { amount } = req.body; // valor inteiro de água
  
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

// 3. dailyReset - Zerar dia (Para o CRON Job)
app.post('/reset-daily', async (req, res) => {
  try {
    await pool.query('UPDATE users SET daily_water = 0');
    res.json({ message: "Daily water resetado para todos!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. weekReset - Zerar semana (Para o CRON Job)
app.post('/reset-week', async (req, res) => {
  try {
    await pool.query('UPDATE users SET week_water = 0');
    res.json({ message: "Week water resetado para todos!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. getAllUsersWater - Placar de líderes
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

// Exporta o app para a Vercel (Serverless)
module.exports = app;

// Inicia o servidor apenas se o arquivo for executado diretamente (Desenvolvimento Local)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}