import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getConversations } from '../api/client';
import type { Conversation } from '../types';

const avatarClasses = ['avatar-blue', 'avatar-pink', 'avatar-green', 'avatar-amber', 'avatar-blue'];

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

export default function Conversations() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    getConversations().then(setConvs).catch(() => {});
  }, []);

  return (
    <div className="flex-col" style={{ height: '100%' }}>
      {/* Panel Header */}
      <div className="panel-header">
        <div>
          <div className="panel-title">近期对话</div>
          <div className="panel-sub">Instagram 私信列表</div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {convs.length === 0 && (
          <div className="text-muted" style={{ textAlign: 'center', padding: '48px 0', fontSize: 12 }}>
            暂无对话
          </div>
        )}
        {convs.map((c, i) => (
          <div
            key={c.id}
            className="list-item"
            onClick={() => navigate(`/conversations/${c.id}`)}
            style={{ padding: '10px 16px' }}
          >
            {/* Avatar */}
            <div className={`avatar avatar-md ${avatarClasses[i % avatarClasses.length]}`}>
              {getInitials(c.ig_username || c.ig_user_id)}
            </div>

            {/* Info */}
            <div className="list-item-info">
              <div className="list-item-name">{c.ig_username || c.ig_user_id}</div>
              <div className="list-item-last">{c.last_message || '暂无消息'}</div>
            </div>

            {/* Meta */}
            <div className="list-item-meta">
              <span className="text-xs">{timeAgo(c.updated_at)}</span>
              <div className="flex items-center gap-6">
                {!c.is_resolved && <span className="unread-dot" />}
                {c.mode === 'ai' ? (
                  <span className="tag-pill tag-ai">AI</span>
                ) : (
                  <span className="tag-pill tag-human">人工</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
