require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const { createClient } = require('@supabase/supabase-js')

const app = express()

// ── TRUST PROXY (crítico en Railway — sin esto req.ip = 127.0.0.1 siempre) ──
app.set('trust proxy', 1)

// Seguridad
app.use(helmet())

app.use(cors({
  origin: [
    'https://app.flota360.com.ar',
    'http://localhost:3000'
  ]
}))

// ── RATE LIMITING ────────────────────────────────────────────────────────────

// Capa 1 — Global: 300 req / 15 min por IP
const limiterGlobal = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.' }
})

// Capa 2 — Escritura (POST / PUT / DELETE): 30 req / 15 min por IP
const limiterEscritura = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de operaciones alcanzado. Espera unos minutos.' }
})

// Capa 3 — Health check: 60 req / min (protege de scraping/enumeration)
const limiterHealth = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes.' }
})

app.use(limiterGlobal)

// Aplicar limiter de escritura a métodos mutantes
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return limiterEscritura(req, res, next)
  }
  next()
})

// ─────────────────────────────────────────────────────────────────────────────

app.use(express.json({ limit: '50kb' }))

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── VALIDACIÓN DE UUID (M1) ──────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUUID(val) {
  return typeof val === 'string' && UUID_RE.test(val)
}
// ────────────────────────────────────────────────────────────────────────

// Auth middleware
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ error: 'No autorizado' })
  }
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    return res.status(401).json({ error: 'Token invalido o expirado' })
  }
  req.user = user
  next()
}

// Helper: obtener perfil del usuario autenticado
const getPerfil = async (userId) => {
  const { data } = await supabase
    .from('perfiles')
    .select('empresa_id, rol')
    .eq('id', userId)
    .single()
  return data
}

// Rutas publicas
app.get('/api/health', limiterHealth, (req, res) => {
  res.json({ status: 'ok' })
})

// Rutas protegidas

app.get('/api/vehiculos/:empresaId', verifyToken, async (req, res) => {
  // ── VALIDACIÓN UUID (M1) ─────────────────────────────────────────────
  const { empresaId } = req.params
  if (!isValidUUID(empresaId)) {
    return res.status(400).json({ error: 'ID de empresa inválido' })
  }
  // ────────────────────────────────────────────────────────────────────
  try {
    const perfil = await getPerfil(req.user.id)
    if (!perfil) return res.status(403).json({ error: 'Perfil no encontrado' })
    if (perfil.rol !== 'super_admin' && perfil.empresa_id !== empresaId) {
      return res.status(403).json({ error: 'Acceso denegado' })
    }
    const { data, error } = await supabase
      .from('vehiculos')
      .select('*')
      .eq('empresa_id', empresaId)
    if (error) throw error
    res.json({ success: true, data })
  } catch (error) {
    console.error('GET /api/vehiculos/:empresaId ->', error.message)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

app.post('/api/vehiculos', verifyToken, async (req, res) => {
  // ── VALIDACIÓN DE INPUTS (M2) ────────────────────────────────────────
  const { marca, modelo, patente } = req.body
  if (!marca || !modelo || !patente) {
    return res.status(400).json({ error: 'Campos requeridos: marca, modelo, patente' })
  }
  if (typeof marca !== 'string' || marca.length > 100) {
    return res.status(400).json({ error: 'Marca inválida (máximo 100 caracteres)' })
  }
  if (typeof modelo !== 'string' || modelo.length > 100) {
    return res.status(400).json({ error: 'Modelo inválido (máximo 100 caracteres)' })
  }
  if (typeof patente !== 'string' || patente.length > 10 || !/^[A-Za-z0-9-]+$/.test(patente)) {
    return res.status(400).json({ error: 'Patente inválida (máximo 10 caracteres alfanuméricos)' })
  }
  // ────────────────────────────────────────────────────────────────────
  try {
    // empresa_id siempre del token, nunca del body
    const perfil = await getPerfil(req.user.id)
    if (!perfil) return res.status(403).json({ error: 'Perfil no encontrado' })
    const { data, error } = await supabase
      .from('vehiculos')
      .insert([{
        marca: marca.trim(),
        modelo: modelo.trim(),
        patente: patente.toUpperCase().trim(),
        empresa_id: perfil.empresa_id
      }])
      .select()
    if (error) throw error
    res.status(201).json({ success: true, data })
  } catch (error) {
    console.error('POST /api/vehiculos ->', error.message)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

app.delete('/api/vehiculos/:id', verifyToken, async (req, res) => {
  // ── VALIDACIÓN UUID (M1) ─────────────────────────────────────────────
  const { id } = req.params
  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'ID de vehículo inválido' })
  }
  // ────────────────────────────────────────────────────────────────────
  try {
    const { data: vehiculo, error: fetchError } = await supabase
      .from('vehiculos')
      .select('empresa_id')
      .eq('id', id)
      .single()
    if (fetchError || !vehiculo) {
      return res.status(404).json({ error: 'Vehiculo no encontrado' })
    }
    const perfil = await getPerfil(req.user.id)
    if (!perfil) return res.status(403).json({ error: 'Perfil no encontrado' })
    if (perfil.rol !== 'super_admin' && vehiculo.empresa_id !== perfil.empresa_id) {
      return res.status(403).json({ error: 'No tenes permiso para eliminar este vehiculo' })
    }
    const { error } = await supabase.from('vehiculos').delete().eq('id', id)
    if (error) throw error
    res.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/vehiculos/:id ->', error.message)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

app.get('/api/mantenimientos/:empresaId', verifyToken, async (req, res) => {
  // ── VALIDACIÓN UUID (M1) ─────────────────────────────────────────────
  const { empresaId } = req.params
  if (!isValidUUID(empresaId)) {
    return res.status(400).json({ error: 'ID de empresa inválido' })
  }
  // ────────────────────────────────────────────────────────────────────
  try {
    const perfil = await getPerfil(req.user.id)
    if (!perfil) return res.status(403).json({ error: 'Perfil no encontrado' })
    if (perfil.rol !== 'super_admin' && perfil.empresa_id !== empresaId) {
      return res.status(403).json({ error: 'Acceso denegado' })
    }
    const { data, error } = await supabase
      .from('mantenimientos_programados')
      .select('*')
      .eq('empresa_id', empresaId)
    if (error) throw error
    res.json({ success: true, data })
  } catch (error) {
    console.error('GET /api/mantenimientos/:empresaId ->', error.message)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// Servidor
const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log('Backend corriendo en puerto ' + PORT)
})
