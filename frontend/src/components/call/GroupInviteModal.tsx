import { useEffect } from 'react'
import { User, UserPlus, X } from 'lucide-react'

interface Props {
  initiatorUsername: string
  memberCount: number
  onAccept: () => void
  onReject: () => void
}

export default function GroupInviteModal({ initiatorUsername, memberCount, onAccept, onReject }: Props) {
  useEffect(() => {
    const timer = setTimeout(onReject, 30_000)
    return () => clearTimeout(timer)
  }, [onReject])

  return (
    <div
      className="modal-backdrop-animate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="group-invite-heading"
      style={{
        position: 'fixed', inset: 0, display: 'flex', zIndex: 1000,
        alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(4px)'
      }}
    >
      <div className="modal-content-animate group-invite-card" style={{ 
        background: 'var(--surface-solid)', borderRadius: 20, padding: '40px 32px', 
        maxWidth: 440, width: '90%', boxShadow: '0 24px 60px rgba(0,0,0,0.12)', 
        textAlign: 'center', position: 'relative'
      }}>
        
        {/* Avatar Section */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          {/* Sparkles and concentric circles SVG */}
          <svg style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 220, height: 160, pointerEvents: 'none' }} viewBox="0 0 220 160">
            {/* Concentric rings */}
            <circle cx="110" cy="80" r="45" fill="#fdf2f8" />
            <circle cx="110" cy="80" r="35" fill="#fce7f3" />
            
            {/* Sparkles/dots */}
            <circle cx="75" cy="50" r="3" fill="#f43f5e" opacity="0.8" />
            <circle cx="85" cy="115" r="4" fill="#ffe4e6" />
            <circle cx="145" cy="50" r="3" fill="#10b981" opacity="0.8" />
            <circle cx="155" cy="105" r="6" fill="#d1fae5" />
          </svg>
          
          <div style={{ 
            width: 50, height: 50, borderRadius: '50%', 
            background: '#fbcfe8', color: '#ec4899',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', zIndex: 1
          }}>
            <User size={24} strokeWidth={2.5} />
          </div>
        </div>

        <h2 id="group-invite-heading" style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px', color: 'var(--text-h)' }}>
          {initiatorUsername}
        </h2>
        <p style={{ fontSize: 15, margin: '0 0 32px', color: 'var(--text)' }}>
          Đang mời bạn vào cuộc gọi nhóm ({memberCount} người)
        </p>
        
        <div style={{ display: 'flex', gap: 16 }}>
          <button 
            onClick={onAccept} 
            type="button"
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              minHeight: 48, borderRadius: 12, background: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.3)', color: '#16a34a',
              fontSize: 15, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(34, 197, 94, 0.15)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(34, 197, 94, 0.08)'}
          >
            <UserPlus size={18} strokeWidth={2.5} />
            Tham gia
          </button>
          
          <button 
            onClick={onReject} 
            type="button"
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              minHeight: 48, borderRadius: 12, background: 'rgba(239, 68, 68, 0.05)',
              border: '1px solid rgba(239, 68, 68, 0.2)', color: '#dc2626',
              fontSize: 15, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)'}
          >
            <X size={18} strokeWidth={2.5} />
            Từ chối
          </button>
        </div>
      </div>
    </div>
  )
}
