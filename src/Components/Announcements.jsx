import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Form, Input, Modal, Radio, Space, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { GetCurrentUser } from '../apiCalls/users'
import {  createAnnouncement, listAnnouncementsPublic } from '../apiCalls/announcements'

const { Title, Paragraph, Text } = Typography

const TYPE_META = {
  info:    { color: 'geekblue',  title: 'Information' },
  warning: { color: 'gold',      title: 'Warning' },
  alert:   { color: 'volcano',   title: 'Alert' },
}

function useUser() {
  const [user, setUser] = useState(null)
  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem('user')
        if (raw) setUser(JSON.parse(raw))
        else {
          const resp = await GetCurrentUser().catch(()=>null)
          if (resp?.success && resp.data) { setUser(resp.data); localStorage.setItem('user', JSON.stringify(resp.data)) }
        }
      } catch {
        //ignore
      }
    })()
  }, [])
  return user
}

export default function Announcements() {
  const user = useUser()
  const role = useMemo(() => String(user?.role || '').toLowerCase(), [user])
  const canManage = ['owner','admin'].includes(role)

  const [items, setItems] = useState([])
  const [, setLoading] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [form] = Form.useForm()

  const LAST_SEEN_KEY = useMemo(() => {
    const k = user?.email || user?.name || 'user'
    return `Announcements:lastSeen:${k}`
  }, [user])

  const markSeenNow = (tsMs) => {
    try { localStorage.setItem(LAST_SEEN_KEY, String(tsMs || Date.now())) } catch {
      ///kj
    }
  }
  

  const load = async () => {
    setLoading(true)
    try {
      const res = await listAnnouncementsPublic({ limit: 50 })
      const list = Array.isArray(res?.data) ? res.data : []
      setItems(list)
      // If user opened the tab, mark as seen now (clears badges across dashboards)
      const ms = list.length && list[0]?.createdAt ? new Date(list[0].createdAt).getTime() : 0
      if (ms) markSeenNow(ms)
      try { window.dispatchEvent(new Event('ann-refresh')) } catch {
    //ji
    }
    } catch {
      message.error('Failed to load announcements')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const onPublish = async () => {
    try {
      const vals = await form.validateFields()
      const payload = { title: vals.title, body: vals.body, type: vals.type, expiresInDays: vals.expiresInDays || 0 }
      const res = await createAnnouncement(payload)
      if (res?.success) {
        message.success('Announcement published')
        setComposeOpen(false)
        form.resetFields()
        load()
      } else {
        message.error(res?.message || 'Failed to publish')
      }
    } catch {
      //fb
    }
  }

  

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 12 }}>
        <Title level={4} style={{ margin: 0 }}>Announcements</Title>
        {canManage && (
          <Button type="primary" onClick={()=> setComposeOpen(true)}>New Announcement</Button>
        )}
      </div>

      {items.length === 0 ? (
        <Paragraph type="secondary">No announcements yet.</Paragraph>
      ) : (
        <Space direction="vertical" style={{ width:'100%' }} size="middle">
          {items.map((it)=> {
            const meta = TYPE_META[it.type] || TYPE_META.info
            return (
              <Card key={String(it._id || it.id || it.createdAt)} size="small" hoverable>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <Tag color={meta.color}>{meta.title}</Tag>
                      <Text strong>{it.title}</Text>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace:'pre-wrap' }}>{it.body}</div>
                    <div style={{ marginTop: 6, color:'#666' }}>{dayjs(it.createdAt).format('DD/MM/YYYY HH:mm')}</div>
                  </div>
                </div>
              </Card>
            )
          })}
        </Space>
      )}

      <Modal
        open={composeOpen}
        title="Publish Announcement"
        onCancel={()=> setComposeOpen(false)}
        onOk={onPublish}
        okText="Announce"
      >
        <Form layout="vertical" form={form} initialValues={{ type:'info', expiresInDays: 3 }}>
          <Form.Item label="Type" name="type" rules={[{ required:true, message:'Select type' }]}>
            <Radio.Group>
              <Radio.Button value="info">Information</Radio.Button>
              <Radio.Button value="warning">Warning</Radio.Button>
              <Radio.Button value="alert">Alert</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="Title" name="title" rules={[{ required:true, message:'Enter title' }]}>
            <Input placeholder="Headline" maxLength={120} />
          </Form.Item>
          <Form.Item label="Message" name="body" rules={[{ required:true, message:'Enter message' }]}>
            <Input.TextArea rows={4} placeholder="Write the announcement" />
          </Form.Item>
          <Form.Item label="Expires in (days)" name="expiresInDays">
            <Input type="number" min={0} placeholder="0 = no expiry" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Popup removed per request: badges on tab indicate new items; opening tab marks as seen */}
    </div>
  )
}
