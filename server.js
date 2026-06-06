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

app.get('/api/test', (req, res) => {
  res.json({ test: 'OK', timestamp: new Date().toISOString() })
})

app.get('/api/vehiculos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vehiculos')
      .select('*')
    console.log('GET /api/vehiculos -> total:', data?.length)
    if (error) throw error
    res.json({ success: true, data })
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/vehiculos/:empresaId', async (req, res) => {
  try {
    const { empresaId } = req.params
    console.log('GET /api/vehiculos/:empresaId -> empresaId:', empresaId)
    if (!empresaId) {
      return res.status(400).json({ error: 'empresaId requerido' })
    }
    const { data, error } = await supabase
      .from('vehiculos')
      .select('*')
      .eq('empresa_id', empresaId)
    console.log('Supabase response:', { data: data?.length, error: error?.message })
    if (error) throw error
    res.json({ success: true, data })
  } catch (error) {
    console.error('Error:', error)
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

app.delete('/api/vehiculos/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!id) {
      return res.status(400).json({ error: 'ID requerido' })
    }
    const { error } = await supabase
      .from('vehiculos')
      .delete()
      .eq('id', id)
    if (error) throw error
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`Backend corriendo en puerto ${PORT}`)
})