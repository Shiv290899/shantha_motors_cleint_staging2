import React from "react";
import { Table, Button, Space, Modal, Form, Input, Select, message, Tag } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { listBranches, listBranchesPublic, createBranch, updateBranch, deleteBranch } from "../../apiCalls/branches";

const TYPE_OPTIONS = [
  { label: "Sales & Services", value: "sales & services" },
  { label: "Sales", value: "sales" },
  { label: "Service", value: "service" },
];

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Under Maintenance", value: "under_maintenance" },
];

export default function Branches() {
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [items, setItems] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [form] = Form.useForm();

  const fetchList = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await listBranches({ limit: 200 });
      if (res?._status === 401 || res?._status === 403) {
        // Fallback to public list so at least read-only data is visible
        const pub = await listBranchesPublic({ limit: 200 });
        if (pub?.success) {
          message.info("Showing public branch list (read-only). Sign in for management.");
          setItems(pub.data.items || []);
          setTotal(pub.data.total || 0);
        } else {
          message.warning("Please login again to manage branches.");
          setItems([]);
          setTotal(0);
        }
      } else if (res?.success) {
        setItems(res.data.items || []);
        setTotal(res.data.total || 0);
      } else {
        message.error(res?.message || "Failed to load branches");
      }
    } catch (e) {
      message.error(e?.message || "Failed to load branches");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchList(); }, [fetchList]);

  const onCreate = () => {
    setEditing(null);
    setModalOpen(true);
    // Defer setting defaults until form is mounted in Modal
    setTimeout(() => {
      form.resetFields();
      form.setFieldsValue({ type: "sales & services", status: "active" });
    }, 0);
  };

  const onEdit = (row) => {
    setEditing(row);
    form.setFieldsValue({
      id: row.id,
      code: row.code,
      name: row.name,
      type: row.type,
      phone: row.phone,
      email: row.email,
      address_line1: row.address?.line1,
      address_line2: row.address?.line2,
      area: row.address?.area,
      city: row.address?.city,
      state: row.address?.state,
      pincode: row.address?.pincode,
      lat: row.location?.coordinates?.[1],
      lng: row.location?.coordinates?.[0],
      status: row.status,
      manager: row.manager || undefined,
      staffIds: Array.isArray(row.staff) ? row.staff.map(String).join(',') : undefined,
      boysIds: Array.isArray(row.boys) ? row.boys.map(String).join(',') : undefined,
      mechanicsIds: Array.isArray(row.mechanics) ? row.mechanics.map(String).join(',') : undefined,
    });
    setModalOpen(true);
  };

  const onDelete = async (row) => {
    Modal.confirm({
      title: `Delete ${row.name}?`,
      content: `This cannot be undone.`,
      okButtonProps: { danger: true },
      okText: "Delete",
      onOk: async () => {
        try {
          const res = await deleteBranch(row.id);
          if (res?.success) {
            message.success("Branch deleted");
            fetchList();
          } else {
            message.error(res?.message || "Delete failed");
          }
        } catch {
          message.error("Delete failed");
        }
      },
    });
  };

  const onSubmit = async () => {
    try {
      const vals = await form.validateFields();
      const payload = {
        code: vals.code,
        name: vals.name,
        type: vals.type,
        phone: vals.phone,
        email: vals.email,
        address: {
          line1: vals.address_line1,
          line2: vals.address_line2,
          area: vals.area,
          city: vals.city,
          state: vals.state,
          pincode: vals.pincode,
        },
        lat: vals.lat,
        lng: vals.lng,
        status: vals.status,
        ...(vals.manager ? { manager: String(vals.manager).trim() } : {}),
        ...(vals.staffIds ? { staff: String(vals.staffIds).split(',').map(s => s.trim()).filter(Boolean) } : {}),
        ...(vals.boysIds ? { boys: String(vals.boysIds).split(',').map(s => s.trim()).filter(Boolean) } : {}),
        ...(vals.mechanicsIds ? { mechanics: String(vals.mechanicsIds).split(',').map(s => s.trim()).filter(Boolean) } : {}),
      };
      setSaving(true);
      let res;
      if (editing?.id) res = await updateBranch(editing.id, payload);
      else res = await createBranch(payload);
      if (res?._status === 401 || res?._status === 403) {
        message.warning("Please login again to continue.");
        return;
      }
      if (res?.success) {
        message.success(editing ? "Branch updated" : "Branch created");
        setModalOpen(false);
        setEditing(null);
        form.resetFields();
        fetchList();
      } else {
        message.error(res?.message || "Save failed");
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || "Save failed";
      message.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: "Code", dataIndex: "code", key: "code", width: 110, sorter: (a, b) => a.code.localeCompare(b.code) },
    { title: "Name", dataIndex: "name", key: "name", sorter: (a, b) => a.name.localeCompare(b.name) },
    { title: "Type", dataIndex: "type", key: "type", width: 150, render: (v) => <Tag color="blue">{v}</Tag> },
    { title: "City", key: "city", width: 140, render: (_, r) => r.address?.city || "—" },
    { title: "Phone", dataIndex: "phone", key: "phone", width: 140 },
    { title: "Staff", key: "staffCount", width: 90, render: (v, r) => (r.activeStaffCount ?? (Array.isArray(r.staff) ? r.staff.length : 0)) },
    { title: "Boys", key: "boysCount", width: 90, render: (v, r) => (r.activeBoysCount ?? (Array.isArray(r.boys) ? r.boys.length : 0)) },
    { title: "Mechanics", key: "mechCount", width: 110, render: (v, r) => (r.activeMechanicsCount ?? (Array.isArray(r.mechanics) ? r.mechanics.length : 0)) },
    { title: "Status", dataIndex: "status", key: "status", width: 160, render: (v) => (
      v === "active" ? <Tag color="green">Active</Tag> : v === "inactive" ? <Tag>Inactive</Tag> : <Tag color="orange">Under Maintenance</Tag>
    ) },
    {
      title: "Actions",
      key: "actions",
      width: 180,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => onEdit(row)}>Edit</Button>
          <Button size="small" danger onClick={() => onDelete(row)}>Delete</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <strong>Total:</strong> {total}
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
          New Branch
        </Button>
      </div>
      <Table
        rowKey={(r) => r.id}
        dataSource={items}
        columns={columns}
        loading={loading}
        pagination={false}
        size="middle"
      />

      <Modal
        title={editing ? `Edit Branch – ${editing.name}` : "New Branch"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={onSubmit}
        okText={editing ? "Save" : "Create"}
        confirmLoading={saving}
        forceRender
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="Code" rules={[{ required: true, message: "Code is required" }]}>
            <Input placeholder="e.g., BDRH" maxLength={10} />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Name is required" }]}>
            <Input placeholder="e.g., Byadarahalli Branch" />
          </Form.Item>
          <Form.Item name="type" label="Type" initialValue="sales & services" rules={[{ required: true }]}>
            <Select options={TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="status" label="Status" initialValue="active" rules={[{ required: true }]}>
            <Select options={STATUS_OPTIONS} />
          </Form.Item>

          <Form.Item name="phone" label="Phone">
            <Input placeholder="Branch phone" />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input placeholder="Branch email" type="email" />
          </Form.Item>

          <Form.Item name="address_line1" label="Address Line 1">
            <Input />
          </Form.Item>
          <Form.Item name="address_line2" label="Address Line 2">
            <Input />
          </Form.Item>
          <Form.Item name="area" label="Area">
            <Input />
          </Form.Item>
          <Form.Item name="city" label="City" rules={[{ required: true, message: "City is required" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="state" label="State">
            <Input />
          </Form.Item>
          <Form.Item name="pincode" label="Pincode">
            <Input />
          </Form.Item>

          <Form.Item name="lat" label="Latitude">
            <Input type="number" step="any" />
          </Form.Item>
          <Form.Item name="lng" label="Longitude">
            <Input type="number" step="any" />
          </Form.Item>

          {/* Associations (IDs). In a future iteration, replace with searchable pickers. */}
          <Form.Item name="manager" label="Manager (User ID)">
            <Input placeholder="24-char user id (optional)" />
          </Form.Item>
          <Form.Item name="staffIds" label="Staff (comma-separated User IDs)">
            <Input placeholder="id1,id2,id3" />
          </Form.Item>
          <Form.Item name="boysIds" label="Boys (comma-separated User IDs)">
            <Input placeholder="id1,id2" />
          </Form.Item>
          <Form.Item name="mechanicsIds" label="Mechanics (comma-separated User IDs)">
            <Input placeholder="id1,id2" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
