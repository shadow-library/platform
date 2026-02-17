/**
 * Importing npm packages
 */
import { Card, Statistic } from 'antd';

/**
 *  Importing user defined modules
 */

/**
 * Declaring types
 */

export interface StatCardProps {
  loading?: boolean;
  title: string;
  value?: number;
  icon: React.ReactNode;
  color: string;
}

/**
 * Declaring constants
 */

export default function StatCard(props: StatCardProps) {
  return (
    <Card className="h-full" loading={props.loading}>
      <Statistic
        loading={props.loading}
        title={props.title}
        value={props.value ?? 0}
        prefix={<span style={{ color: props.color }}>{props.icon}</span>}
        styles={{ content: { color: props.color } }}
      />
    </Card>
  );
}
