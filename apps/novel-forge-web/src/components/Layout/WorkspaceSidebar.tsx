/**
 * Importing npm packages
 */
import {
  AuditOutlined,
  BranchesOutlined,
  BuildOutlined,
  ClockCircleOutlined,
  ClusterOutlined,
  EditOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  FormOutlined,
  GlobalOutlined,
  HistoryOutlined,
  OrderedListOutlined,
  PictureOutlined,
  ProfileOutlined,
  ReadOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';

/**
 * Importing user defined modules
 */
import { useProjectQuery } from '@/lib/apis';
import { coverColor, projectKindLabel, projectTitle } from '@/lib/format';

/**
 * Importing styles
 */
import styles from './Layout.module.css';

export default function WorkspaceSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { novelId = '' } = useParams({ strict: false }) as { novelId?: string };
  const base = `/novels/${novelId}`;
  const { data: project } = useProjectQuery(novelId);
  const title = project ? projectTitle(project) : 'Loading…';
  const subtitle = project ? projectKindLabel(project.kind) : 'switch novel';

  const menuItems: MenuProps['items'] = [
    { type: 'group', label: 'Plan', children: [
      { key: `${base}/overview`, icon: <ReadOutlined />, label: 'Overview' },
      { key: `${base}/story-bible`, icon: <ProfileOutlined />, label: 'Story Bible' },
      { key: `${base}/world`, icon: <GlobalOutlined />, label: 'World' },
      { key: `${base}/plot`, icon: <BranchesOutlined />, label: 'Plot' },
      { key: `${base}/volumes`, icon: <OrderedListOutlined />, label: 'Volumes & Arcs' },
      { key: `${base}/timeline`, icon: <ClockCircleOutlined />, label: 'Timeline' },
    ] },
    { type: 'group', label: 'Lore', children: [
      { key: `${base}/characters`, icon: <TeamOutlined />, label: 'Characters' },
      { key: `${base}/locations`, icon: <EnvironmentOutlined />, label: 'Locations' },
      { key: `${base}/factions`, icon: <ClusterOutlined />, label: 'Factions' },
      { key: `${base}/magic`, icon: <ExperimentOutlined />, label: 'Magic system' },
      { key: `${base}/species`, icon: <BuildOutlined />, label: 'Species' },
      { key: `${base}/lore`, icon: <FileTextOutlined />, label: 'Lore entries' },
    ] },
    { type: 'group', label: 'Write', children: [
      { key: `${base}/chapters`, icon: <OrderedListOutlined />, label: 'Chapters' },
      { key: `${base}/chapter-brief`, icon: <FormOutlined />, label: 'Chapter brief' },
      { key: `${base}/chapter-editor`, icon: <EditOutlined />, label: 'Editor' },
      { key: `${base}/chapter-generate`, icon: <ThunderboltOutlined />, label: 'Generate' },
      { key: `${base}/chapter-review`, icon: <AuditOutlined />, label: 'Review & diff' },
    ] },
    { type: 'group', label: 'QA', children: [
      { key: `${base}/continuity`, icon: <WarningOutlined />, label: 'Continuity' },
      { key: `${base}/approvals`, icon: <SafetyCertificateOutlined />, label: 'Approvals' },
      { key: `${base}/versions`, icon: <HistoryOutlined />, label: 'Version history' },
      { key: `${base}/assets`, icon: <PictureOutlined />, label: 'Assets' },
    ] },
  ];

  return (
    <aside className={styles.sideNavContainer}>
      <button type="button" className={styles.novelSwitch} onClick={() => navigate({ to: '/projects' })}>
        <span className={styles.novelSwitchCover} style={{ background: coverColor(novelId) }} />
        <span className={styles.novelSwitchText}>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </span>
      </button>
      <Menu
        mode="inline"
        theme="dark"
        selectedKeys={[location.pathname]}
        onClick={e => navigate({ to: e.key })}
        items={menuItems}
        style={{ backgroundColor: 'transparent', border: 'none', padding: '8px' }}
      />
    </aside>
  );
}
