/**
 * Importing npm packages
 */
import { CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, NotificationOutlined } from '@ant-design/icons';
import { createFileRoute } from '@tanstack/react-router';
import { Card, Col, Row, Typography, Progress, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';

/**
 *  Importing user defined modules
 */
import { getStats, type NotificationStatsWithDate } from '@/api';
import { ChannelCard, DashboardUtils, StatCard } from '@/features/dashboard';

/**
 * Declaring types
 */

/**
 * Declaring constants
 */

export const Route = createFileRoute('/')({
  component: Dashboard,
  loader: () => getStats().then(result => result.data),
});

const trendColumns: ColumnsType<NotificationStatsWithDate> = [
  {
    title: 'Date',
    dataIndex: 'date',
    key: 'date',
  },
  {
    title: 'Total',
    dataIndex: 'total',
    key: 'total',
    align: 'center',
  },
  {
    title: 'Succeeded',
    dataIndex: 'succeeded',
    key: 'succeeded',
    align: 'center',
    render: (value: number) => <span className="text-[var(--color-success)]">{value}</span>,
  },
  {
    title: 'Failed',
    dataIndex: 'failed',
    key: 'failed',
    align: 'center',
    render: (value: number) => <span className="text-[var(--color-error)]">{value}</span>,
  },
  {
    title: 'Pending',
    dataIndex: 'pending',
    key: 'pending',
    align: 'center',
    render: (value: number) => <span className="text-[var(--color-warning)]">{value}</span>,
  },
  {
    title: 'Success Rate',
    key: 'successRate',
    align: 'center',
    render: (_, record) => {
      const progress = DashboardUtils.getSuccessProgress(record.total, record.succeeded);
      return <Progress percent={progress.rate} size="small" status={progress.status} strokeColor={progress.strokeColor} aria-label={`Success Rate: ${progress.rate}%`} />;
    },
  },
];

function Dashboard() {
  const { today, trend } = Route.useLoaderData();
  const overallProgress = DashboardUtils.getSuccessProgress(today.overall.total, today.overall.succeeded);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <Typography.Title level={2} className="!mb-0">
          Dashboard
        </Typography.Title>
        <Typography.Text type="secondary">Today: {today.date}</Typography.Text>
      </div>

      {/* Overall Stats */}
      <Card title="Today's Overview" className="shadow-sm">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <StatCard title="Total Notifications" value={today.overall.total} icon={<NotificationOutlined />} color="var(--color-primary)" />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <StatCard title="Succeeded" value={today.overall.succeeded} icon={<CheckCircleOutlined />} color="var(--color-success)" />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <StatCard title="Failed" value={today.overall.failed} icon={<CloseCircleOutlined />} color="var(--color-error)" />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <StatCard title="Pending" value={today.overall.pending} icon={<ClockCircleOutlined />} color="var(--color-warning)" />
          </Col>
        </Row>
        <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-4">
            <span className="text-[var(--color-text-secondary)]">Overall Success Rate:</span>
            <Progress
              percent={overallProgress.rate}
              status={overallProgress.status}
              strokeColor={overallProgress.strokeColor}
              className="flex-1 max-w-md"
              aria-label={`Overall Success Rate: ${overallProgress.rate}%`}
            />
          </div>
        </div>
      </Card>

      {/* Channel Stats */}
      <Typography.Title className="mt-5" level={4}>
        Channel Breakdown
      </Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <ChannelCard channel="email" stats={today.channels.email} />
        </Col>
        <Col xs={24} md={8}>
          <ChannelCard channel="sms" stats={today.channels.sms} />
        </Col>
        <Col xs={24} md={8}>
          <ChannelCard channel="push" stats={today.channels.push} />
        </Col>
      </Row>

      {/* Trend */}
      <Card
        className="shadow-sm"
        title={
          <div className="flex justify-between items-center">
            <span>5-Day Trend</span>
            <Typography.Text type="secondary" className="font-normal">
              {trend.fromDate} - {trend.toDate}
            </Typography.Text>
          </div>
        }
      >
        <Table columns={trendColumns} dataSource={trend.stats} rowKey="date" pagination={false} />
      </Card>
    </div>
  );
}
