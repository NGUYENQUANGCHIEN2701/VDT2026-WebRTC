import type { OnlineUser } from '../../realtime/messages'
import OnlineUserRow from './OnlineUserRow'

interface Props {
  users: OnlineUser[]
  selected: string[]
  maxSelect?: number
  onToggle: (username: string) => void
}

export default function MultiSelectUserList({ users, selected, maxSelect = 3, onToggle }: Props) {
  return (
    <ul className="home-user-list" role="list">
      {users.map((user) => {
        const checked = selected.includes(user.username)
        const disabled = user.status !== 'ONLINE' || (!checked && selected.length >= maxSelect)
        return (
          <OnlineUserRow
            key={user.username}
            user={user}
            groupMode
            selected={checked}
            selectionDisabled={disabled}
            onSelect={() => onToggle(user.username)}
          />
        )
      })}
    </ul>
  )
}
