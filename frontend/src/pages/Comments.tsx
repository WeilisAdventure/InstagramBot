import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getCommentEvents,
  markCommentRead,
  markAllCommentsRead,
  deleteCommentEvent,
  openCommentConversation,
} from '../api/client';
import type { CommentEvent } from '../types';

const ACTION_LABEL: Record<CommentEvent['action_taken'], { text: string; color: string }> = {
  auto_replied: { text: '已自动回复', color: '#16a34a' },
  skipped_disabled: { text: '触发已关闭', color: '#d97706' },
  no_match: { text: '无匹配规则', color: '#6b7280' },
};

function parseTs(iso: string): number {
  // Backend may emit naive UTC strings (no Z, no offset). new Date() would
  // then parse them as local time, which is wrong. If there's no timezone
  // marker, treat the value as UTC.
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
  return new Date(hasTz ? iso : iso + 'Z').getTime();
}
// We rely on Graph API's permalink (server-fetched). The numeric->shortcode
// trick is unreliable across account types and can yield "Post isn't available".

function timeAgo(iso: string): string {
  const diff = (Date.now() - parseTs(iso)) / 1000;
  if (diff < 0) return '刚刚';
  if (diff < 60) return `${Math.floor(diff)}秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}

export default function Comments() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CommentEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const load = async () => {
    try {
      const data = await getCommentEvents({ unread_only: filter === 'unread', limit: 100 });
      setItems(data.items);
      setUnread(data.unread_count);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const onMarkRead = async (id: number) => {
    await markCommentRead(id);
    load();
  };
  const onMarkAll = async () => {
    await markAllCommentsRead();
    load();
  };
  const onDelete = async (id: number) => {
    await deleteCommentEvent(id);
    load();
  };
  const onOpenConversation = async (id: number) => {
    try {
      const { conversation_id } = await openCommentConversation(id);
      navigate(`/conversations?conv=${conversation_id}`);
    } catch (e) {
      alert('打开会话失败：' + (e as Error).message);
    }
  };

  return (
    <div className="flex-col" style={{ height: '100%' }}>
      <div className="panel-header" style={{ background: 'var(--bg-primary)', justifyContent: 'space-between' }}>
        <div className="flex items-center gap-8">
          <span className="panel-title">评论收件箱</span>
          {unread > 0 && (
            <span
              style={{
                background: '#dc2626',
                color: '#fff',
                fontSize: 10,
                padding: '2px 7px',
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              {unread} 未读
            </span>
          )}
        </div>
        <div className="flex items-center gap-6">
          <div className="radio-group" style={{ margin: 0 }}>
            <span
              className={`radio-opt${filter === 'all' ? ' active' : ''}`}
              onClick={() => setFilter('all')}
            >
              全部
            </span>
            <span
              className={`radio-opt${filter === 'unread' ? ' active' : ''}`}
              onClick={() => setFilter('unread')}
            >
              仅未读
            </span>
          </div>
          {unread > 0 && (
            <button className="btn" onClick={onMarkAll} style={{ fontSize: 11, padding: '4px 10px' }}>
              全部标记已读
            </button>
          )}
        </div>
      </div>

      <div className="flex-1" style={{ overflow: 'auto', background: 'var(--bg-secondary)' }}>
        {items.length === 0 ? (
          <div className="flex items-center justify-center text-muted" style={{ padding: 60, fontSize: 12 }}>
            {filter === 'unread' ? '没有未读评论' : '暂无评论事件'}
          </div>
        ) : (
          items.map((c) => {
            const meta = ACTION_LABEL[c.action_taken];
            return (
              <div
                key={c.id}
                style={{
                  padding: '12px 16px',
                  borderBottom: '0.5px solid var(--border-soft)',
                  background: c.is_read ? 'transparent' : 'var(--bg-primary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div className="flex items-center gap-8">
                  {!c.is_read && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        background: '#dc2626',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span style={{ fontWeight: 600, fontSize: 13 }}>@{c.username || c.user_id}</span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: '2px 7px',
                      borderRadius: 10,
                      background: meta.color + '22',
                      color: meta.color,
                      fontWeight: 500,
                    }}
                  >
                    {meta.text}
                  </span>
                  <span className="flex-1" />
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {timeAgo(c.created_at)}
                  </span>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5, paddingLeft: c.is_read ? 0 : 14 }}>
                  {c.text || <em style={{ color: 'var(--text-tertiary)' }}>（空评论）</em>}
                </div>
                <div className="flex items-center gap-6" style={{ paddingLeft: c.is_read ? 0 : 14 }}>
                  {c.permalink ? (
                    <a
                      href={c.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs"
                      style={{ color: 'var(--accent)' }}
                    >
                      查看帖子 ↗
                    </a>
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      帖子链接获取中...
                    </span>
                  )}
                  <span className="flex-1" />
                  <button
                    className="btn-primary"
                    onClick={() => onOpenConversation(c.id)}
                    style={{ fontSize: 11, padding: '3px 8px' }}
                  >
                    在私信对话回复
                  </button>
                  {!c.is_read && (
                    <button
                      className="btn"
                      onClick={() => onMarkRead(c.id)}
                      style={{ fontSize: 11, padding: '3px 8px' }}
                    >
                      标记已读
                    </button>
                  )}
                  <button
                    className="btn"
                    onClick={() => onDelete(c.id)}
                    style={{ fontSize: 11, padding: '3px 8px', color: '#dc2626' }}
                  >
                    删除
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
