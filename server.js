const express = require('express')
const cors = require('cors')
const { createClient } = require('@supabase/supabase-js')

const app = express()
app.use(cors())
app.use(express.json())

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend funcionando' })
})

app.get('/api/vehiculos/:empresaId', async (req, res) => {
  try {
    const { empresaId } = req.params
    if (!empresaId) {
      return res.status(400).json({ error: 'empresaId requerido' })
    }
    const { data, error } = await supabase
      .from('vehiculos')
      .select('*')
      .eq('empresa_id', empresaId)
    if (error) throw error
    res.json({ success: true, data })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/vehiculos', async (req, res) => {
  try {
    const { marca, modelo, patente, empresa_id } = req.body
    if (!marca || !modelo || !patente || !empresa_id) {
      return res.status(400).json({ error: 'Campos requeridos' })
    }
    const { data, error } = await supabase
      .from('vehiculos')
      .insert([{ marca, modelo, patente: patente.toUpperCase(), empresa_id }])
      .select()
    if (error) throw error
    res.status(201).json({ success: true, data })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`Backend corriendo en puerto ${PORT}`)
})