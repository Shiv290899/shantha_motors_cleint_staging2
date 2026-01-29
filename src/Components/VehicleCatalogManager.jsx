import React, { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Table, Button, Space, Modal, Form, Input, InputNumber, message, Popconfirm, Alert, Typography, Tag, Select } from 'antd'
import { ReloadOutlined, PlusOutlined, EditOutlined } from '@ant-design/icons'
import { exportToCsv } from '../utils/csvExport'

const { Text } = Typography

// Helpers reused from Quotation/Stock for CSV fallback
const HEADERS = {
  company: ['Company', 'Company Name'],
  model: ['Model', 'Model Name'],
  variant: ['Variant'],
  color: ['Color', 'Colours', 'Colors', 'Colour', 'Available Colors'],
  price: ['On-Road Price', 'On Road Price', 'OnRoadPrice', 'Price'],
}

const parseCsv = (text) => {
  const rows = []
  let row = [], col = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1]
    if (c === '"' && !inQuotes) { inQuotes = true; continue }
    if (c === '"' && inQuotes) { if (n === '"') { col += '"'; i++; continue } inQuotes = false; continue }
    if (c === ',' && !inQuotes) { row.push(col); col = ''; continue }
    if ((c === '\n' || c === '\r') && !inQuotes) {
      if (col !== '' || row.length) { row.push(col); rows.push(row); row = []; col = '' }
      if (c === '\r' && n === '\n') i++
      continue
    }
    col += c
  }
  if (col !== '' || row.length) { row.push(col); rows.push(row) }
  return rows
}

const fetchSheetRowsCSV = async (url) => {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error('Sheet fetch failed')
  const csv = await res.text()
  if (csv.trim().startsWith('<')) throw new Error('Expected CSV, got HTML')
  const rows = parseCsv(csv)
  if (!rows.length) return []
  const headers = rows[0].map((h) => (h || '').trim())
  return rows.slice(1).map((r) => {
    const obj = {}
    headers.forEach((h, i) => (obj[h] = r[i] ?? ''))
    return obj
  })
}

const pick = (row, keys) => String(keys.map((k) => row[k] ?? '').find((v) => v !== '') || '').trim()

const buildCatalogKey = (company, model, variant) => {
  const toKey = (s) => String(s || '').trim().toUpperCase()
  return [toKey(company), toKey(model), toKey(variant)].join('|')
}

const normalizeRow = (row = {}) => {
  const rawPrice =
    pick(row, HEADERS.price) ||
    row.onRoadPrice ||
    row.OnRoadPrice ||
    row.onroadprice ||
    row.price ||
    0;
  const rawColor = pick(row, HEADERS.color) || row.color || row.colors || ''
  const num = (v) => Number(String(v || 0).replace(/[",\s₹]/g, '')) || 0
  const isNumericLike = (v) => {
    const s = String(v || '').replace(/[",\s₹]/g, '')
    return s !== '' && !Number.isNaN(Number(s))
  }
  const company = pick(row, HEADERS.company) || row.company || ''
  const model = pick(row, HEADERS.model) || row.model || ''
  const variant = pick(row, HEADERS.variant) || row.variant || ''
  let price = num(rawPrice)
  let color = String(rawColor || '').trim()
  const rawKey = row.key || row.Key || ''
  const rawUpdatedAt = row.UpdatedAt || row.updatedAt || row.updated_at || row.updated || ''
  const rawUpdatedBy = row.UpdatedBy || row.updatedBy || row.updated_by || row.user || ''
  const looksLikeDate = (v) => {
    const d = new Date(v)
    return !Number.isNaN(d.getTime())
  }
  const looksLikeKey = (v) => String(v || '').includes('|')
  const fallbackKey = buildCatalogKey(company, model, variant)
  let updatedAt = rawUpdatedAt
  let updatedBy = rawUpdatedBy
  let key = rawKey || fallbackKey
  if (!looksLikeKey(key) || key === '') key = fallbackKey
  const maybeShifted = !isNumericLike(rawPrice) && isNumericLike(rawColor) && price === 0
  if (maybeShifted) {
    price = num(rawColor)
    color = ''
    if (looksLikeKey(rawPrice)) key = rawPrice
    if (!rawUpdatedBy && looksLikeDate(rawKey)) {
      updatedAt = rawKey
      updatedBy = rawUpdatedAt
    }
  }
  return {
    id: row.id || row._id || row.rowId || row._row || undefined,
    company,
    model,
    variant,
    color,
    onRoadPrice: price,
    updatedAt,
    updatedBy,
    key,
  }
}

export default function VehicleCatalogManager({ csvFallbackUrl }) {
  const GAS_URL = import.meta.env.VITE_VEHICLE_CATALOG_GAS_URL || 'https://script.google.com/macros/s/AKfycbw0zvptYU-X0yBRFytBJZeli0Dr-uOBFDSfpYgQeWv7nKMWXD73piVndyyTiARU0FL-Lg/exec'
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const [gasMissing, setGasMissing] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCompany, setFilterCompany] = useState('all')
  const [filterVariant, setFilterVariant] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const norm = (s) => String(s || '').trim().toLowerCase()

  const catalogKey = (r) => `${String(r.company || '').trim().toUpperCase()}|${String(r.model || '').trim().toUpperCase()}|${String(r.variant || '').trim().toUpperCase()}`

  const listVehicleCatalog = async () => {
    if (!GAS_URL) throw new Error('VEHICLE_CATALOG_GAS_URL is not configured')
    const url = `${GAS_URL}?action=list`
    const res = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' })
    if (!res.ok) throw new Error('Failed to fetch catalog')
    return res.json()
  }

  const upsertVehicleCatalogRow = async (payload) => {
    if (!GAS_URL) throw new Error('VEHICLE_CATALOG_GAS_URL is not configured')
    const body = new URLSearchParams({ action: 'upsert', ...payload })
    const res = await fetch(GAS_URL, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body,
    })
    if (!res.ok) throw new Error('Save failed')
    return res.json()
  }

  const deleteVehicleCatalogRow = async (payload) => {
    if (!GAS_URL) throw new Error('VEHICLE_CATALOG_GAS_URL is not configured')
    const body = new URLSearchParams({ action: 'delete', ...payload })
    const res = await fetch(GAS_URL, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body,
    })
    if (!res.ok) throw new Error('Delete failed')
    return res.json()
  }

  const load = async () => {
    setLoading(true)
    setGasMissing(false)
    try {
      const resp = await listVehicleCatalog()
      const data = resp?.data || resp?.items || resp?.rows || resp || []
      const norm = Array.isArray(data) ? data.map(normalizeRow).filter((r) => r.company && r.model && r.variant) : []
      setRows(norm)
      if (resp?.ok === false && /catalog gas url/i.test(String(resp?.message || ''))) setGasMissing(true)
    } catch  {
      // Fallback to CSV if provided
      if (csvFallbackUrl) {
        try {
          const csvRows = await fetchSheetRowsCSV(csvFallbackUrl)
          const norm = csvRows.map(normalizeRow).filter((r) => r.company && r.model && r.variant)
          setRows(norm)
          setGasMissing(true) // saving will be disabled
        } catch {
          setRows([])
        }
      } else {
        setRows([])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleAdd = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const handleEdit = (record) => {
    setEditing(record)
    form.setFieldsValue({
      company: record.company,
      model: record.model,
      variant: record.variant,
      color: record.color,
      onRoadPrice: record.onRoadPrice,
    })
    setModalOpen(true)
  }

  const handleDelete = async (record) => {
    try {
      setSaving(true)
      const id = record.id || record.rowId || undefined
      const payload = { id, company: record.company, model: record.model, variant: record.variant, key: catalogKey(record) }
      const resp = await deleteVehicleCatalogRow(payload)
      const ok = (resp?.success ?? resp?.ok ?? true) !== false
      if (!ok) throw new Error(resp?.message || 'Delete failed')
      message.success('Vehicle deleted')
      await load()
    } catch (err) {
      message.error(err?.message || 'Could not delete vehicle')
    } finally {
      setSaving(false)
    }
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const variantQ = filterVariant.trim().toLowerCase()
    return rows.filter((r) => {
      const matchesSearch = !q || [r.company, r.model, r.variant, r.color, r.updatedBy].some((f) =>
        String(f || '').toLowerCase().includes(q))
      const matchesCompany = filterCompany === 'all' || norm(r.company) === filterCompany
      const matchesVariant = !variantQ || norm(r.variant).includes(variantQ)
      return matchesSearch && matchesCompany && matchesVariant
    })
  }, [rows, search, filterCompany, filterVariant])
  const tableKey = useMemo(() => `vc-${filterCompany}-${filterVariant}-${search}`, [filterCompany, filterVariant, search])
  useEffect(() => { setPage(1) }, [filterCompany, filterVariant, search])

  const stats = useMemo(() => {
    const count = filteredRows.length
    const totalPrice = filteredRows.reduce((sum, r) => sum + (Number(r.onRoadPrice) || 0), 0)
    const avgPrice = count ? Math.round(totalPrice / count) : 0
    const companies = new Set(filteredRows.map((r) => norm(r.company)))
    const variants = new Set(filteredRows.map((r) => norm(r.variant)))
    return { count, totalPrice, avgPrice, companyCount: companies.size, variantCount: variants.size }
  }, [filteredRows, norm])

  const companyOptions = useMemo(() => {
    const set = new Set(rows.map((r) => norm(r.company)).filter(Boolean))
    return Array.from(set).map((c) => ({ value: c, label: (c || '').toUpperCase() })).sort((a, b) => a.label.localeCompare(b.label))
  }, [rows])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      // force uppercase on inputs
      ;['company','model','variant'].forEach((k) => {
        if (values[k]) values[k] = String(values[k]).toUpperCase()
      })
      if (values.color) values.color = String(values.color).toUpperCase().trim()
      setSaving(true)
      const payload = {
        ...values,
        onRoadPrice: Number(values.onRoadPrice || 0) || 0,
        id: editing?.id,
        key: editing?.key || catalogKey(values),
        updatedBy: (() => {
          try {
            const u = JSON.parse(localStorage.getItem('user') || 'null')
            return u?.name || u?.email || ''
          } catch { return '' }
        })(),
        action: 'upsert',
      }
      const resp = await upsertVehicleCatalogRow(payload)
      const ok = (resp?.success ?? resp?.ok ?? true) !== false
      if (!ok) throw new Error(resp?.message || 'Save failed')
      message.success(editing ? 'Vehicle updated' : 'Vehicle added')
      setModalOpen(false)
      setEditing(null)
      await load()
    } catch (err) {
      if (err?.errorFields) return // validation error
      message.error(err?.message || 'Could not save vehicle')
    } finally {
      setSaving(false)
    }
  }

  const columns = useMemo(() => [
    { title: 'Company', dataIndex: 'company', key: 'company', sorter: (a, b) => a.company.localeCompare(b.company) },
    { title: 'Model', dataIndex: 'model', key: 'model', sorter: (a, b) => a.model.localeCompare(b.model) },
    { title: 'Variant', dataIndex: 'variant', key: 'variant', sorter: (a, b) => a.variant.localeCompare(b.variant) },
    { title: 'Colors', dataIndex: 'color', key: 'color', render: (v) => v || <Text type="secondary">-</Text> },
    { title: 'On-Road Price (₹)', dataIndex: 'onRoadPrice', key: 'onRoadPrice', render: (v) => v ? v.toLocaleString('en-IN') : <Text type="secondary">0</Text>, sorter: (a, b) => (a.onRoadPrice || 0) - (b.onRoadPrice || 0) },
    { title: 'Updated At', dataIndex: 'updatedAt', key: 'updatedAt', render: (v) => v ? dayjs(v).format('DD-MM-YYYY HH:mm') : <Text type="secondary">-</Text> },
    { title: 'Updated By', dataIndex: 'updatedBy', key: 'updatedBy', render: (v) => v || <Text type="secondary">-</Text> },
    {
      title: 'Actions', key: 'actions', render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} disabled={saving || gasMissing}>Edit</Button>
          <Popconfirm title="Delete this vehicle?" onConfirm={() => handleDelete(record)} disabled={saving || gasMissing}>
            <Button size="small" danger disabled={saving || gasMissing}>Delete</Button>
          </Popconfirm>
        </Space>
      )
    }
  ], [saving, gasMissing])

  const handleExportCsv = () => {
    if (!filteredRows.length) {
      message.info('No catalog rows to export for current filters')
      return
    }
    const headers = [
      { key: 'company', label: 'Company' },
      { key: 'model', label: 'Model' },
      { key: 'variant', label: 'Variant' },
      { key: 'color', label: 'Color' },
      { key: 'onRoadPrice', label: 'On-Road Price' },
      { key: 'updatedAt', label: 'Updated At' },
      { key: 'updatedBy', label: 'Updated By' },
    ]
    const rowsForCsv = filteredRows.map((r) => ({
      company: r.company,
      model: r.model,
      variant: r.variant,
      color: r.color,
      onRoadPrice: r.onRoadPrice,
      updatedAt: r.updatedAt,
      updatedBy: r.updatedBy,
    }))
    exportToCsv({ filename: 'vehicle-catalog.csv', headers, rows: rowsForCsv })
    message.success(`Exported ${rowsForCsv.length} vehicles`)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ padding: 12, borderRadius: 10, background: 'linear-gradient(120deg,#2563eb0d,#2563eb1f)', border: '1px solid #dbeafe' }}>
          <div style={{ fontSize: 12, color: '#2563eb' }}>Records</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.count.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Filtered vehicles</div>
        </div>
        
        <div style={{ padding: 12, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, color: '#0f172a' }}>Mix</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{stats.companyCount} brands • {stats.variantCount} variants</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {filterCompany !== 'all' ? `Filtered: ${filterCompany.toUpperCase()}` : 'All brands'}
          </div>
        </div>
      </div>

      <Space style={{ marginBottom: 12, flexWrap: 'wrap', width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} disabled={gasMissing}>Add Vehicle</Button>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Reload</Button>
          <Button onClick={handleExportCsv}>Export CSV</Button>
          {gasMissing && (
            <Tag color="red">Save disabled (configure VEHICLE_CATALOG_GAS_URL)</Tag>
          )}
        </Space>
        <Space wrap>
          <Input
            placeholder="Search company/model/variant/color/user"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 260 }}
          />
          <Input
            placeholder="Filter variant"
            allowClear
            value={filterVariant}
            onChange={(e) => setFilterVariant(e.target.value)}
            style={{ maxWidth: 160 }}
          />
          <Select
            value={filterCompany}
            onChange={(v) => setFilterCompany(v === undefined ? 'all' : norm(v))}
            style={{ minWidth: 140 }}
            options={[{ value: 'all', label: 'All Companies' }, ...companyOptions]}
            showSearch
            optionFilterProp="label"
            allowClear={false}
          />
        </Space>
      </Space>
      {gasMissing && (
        <Alert
          showIcon
          type="warning"
          style={{ marginBottom: 12 }}
          message="Catalog GAS URL not configured"
          description="Listing works from the published CSV, but saving/updating requires VEHICLE_CATALOG_GAS_URL in the environment."
        />
      )}
      <div style={{ marginBottom: 12, fontSize: 12, color: '#475569' }}>
        Showing {filteredRows.length.toLocaleString('en-IN')} of {rows.length.toLocaleString('en-IN')} catalog records.
      </div>
      <Table
        key={tableKey}
        columns={columns}
        dataSource={filteredRows}
        loading={loading}
        rowKey={(r) => r.id || r.key || catalogKey(r)}
        pagination={{
          current: page,
          pageSize,
          total: filteredRows.length,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10','25','50','100','200'],
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
        }}
        size="middle"
      />

      <Modal
        open={modalOpen}
        title={editing ? 'Edit Vehicle' : 'Add Vehicle'}
        onCancel={() => { setModalOpen(false); setEditing(null) }}
        onOk={handleSubmit}
        okButtonProps={{ loading: saving }}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="company" label="Company" rules={[{ required: true, message: 'Enter company' }]}>
            <Input placeholder="e.g., HONDA" allowClear style={{ textTransform: 'uppercase' }} onChange={(e) => form.setFieldsValue({ company: (e.target.value || '').toUpperCase() })} />
          </Form.Item>
          <Form.Item name="model" label="Model" rules={[{ required: true, message: 'Enter model' }]}>
            <Input placeholder="e.g., SHINE" allowClear style={{ textTransform: 'uppercase' }} onChange={(e) => form.setFieldsValue({ model: (e.target.value || '').toUpperCase() })} />
          </Form.Item>
          <Form.Item name="variant" label="Variant" rules={[{ required: true, message: 'Enter variant' }]}>
            <Input placeholder="e.g., DISC" allowClear style={{ textTransform: 'uppercase' }} onChange={(e) => form.setFieldsValue({ variant: (e.target.value || '').toUpperCase() })} />
          </Form.Item>
          <Form.Item name="color" label="Colors (comma-separated)">
            <Input
              placeholder="e.g., RED, BLACK, BLUE"
              allowClear
              style={{ textTransform: 'uppercase' }}
              onChange={(e) => form.setFieldsValue({ color: (e.target.value || '').toUpperCase() })}
            />
          </Form.Item>
          <Form.Item name="onRoadPrice" label="On-Road Price (₹)" rules={[{ required: true, message: 'Enter price' }]}>
            <InputNumber style={{ width: '100%' }} min={0} step={500} parser={(v) => Number((v || '').toString().replace(/[^\d.-]/g, ''))} formatter={(v) => (v ? Number(v).toLocaleString('en-IN') : '')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
