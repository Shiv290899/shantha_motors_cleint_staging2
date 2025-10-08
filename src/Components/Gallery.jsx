import React from "react";
import { Row, Col, Typography, Image, Card } from "antd";

const { Title, Paragraph } = Typography;

const IMAGES = [
  {
    src: "https://lh3.googleusercontent.com/gps-cs-s/AC9h4npE_SXPWC74UShd1tPCt5leN67LwLw6wI5vK9CQS2NP5UDUV7v3tzrOFqLgWCOCO1XkhwDg6eA47_EA_zQMl645hikg9XuFlU8ETH3LidlyWSojXr-J5Mj8Fl8q2OYGe2p-L993=s1360-w1360-h1020-rw",
    alt: "Service Bay",
  },
  {
    src: "https://lh3.googleusercontent.com/gps-cs-s/AC9h4nrlPhyauu7LbvcpKwhPHxdMfj337f7HgCoBSR8vheBmtfXaCeY4PALwo1vpbKx7LRCdRof6Yiw4eHwCfPBCMEnPVBhA2meoE0l6U42aF51NZFi4jUWYBmCpGV82eD_P7ghgRq7h=s1360-w1360-h1020-rw",
    alt: "Delivery Area",
  },
  {
    src: "https://lh3.googleusercontent.com/gps-cs-s/AC9h4nqbC1mBFlaJ9yDCMcugW_hZYdPqYjPl0Rdb4xTTo33HcAhDJ38uVzEYAcPHw2TeTldfvB5MTKDQg-Pm68xt270v-VQARweM49kza0fnIoPfw0TpQoBVQ8KePy1ONdbB-rH-MKM=s1360-w1360-h1020-rw",
    alt: "Showroom Front",
  },
];

export default function Gallery() {
  const container = { maxWidth: 1200, margin: "0 auto", padding: 16 };

  return (
    <div style={container}>
      <Title level={2} style={{ marginTop: 0 }}>Gallery</Title>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        A few photos from our showrooms and service bays.
      </Paragraph>

      <Image.PreviewGroup>
        <Row gutter={[16, 16]}>
          {IMAGES.map((img, i) => (
            <Col xs={24} sm={12} md={8} key={i}>
              <Card hoverable bodyStyle={{ padding: 8 }}>
                <Image
                  src={img.src}
                  alt={img.alt}
                  style={{ width: "100%", height: 220, objectFit: "cover", borderRadius: 8 }}
                  placeholder
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              </Card>
            </Col>
          ))}
        </Row>
      </Image.PreviewGroup>
    </div>
  );
}

