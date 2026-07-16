import type { WorkUser } from '../../../features/myWork/types'

type UserRoleSwitcherProps = {
  users: WorkUser[]
  selectedUserId: string
  onChange: (userId: string) => void
}

export function UserRoleSwitcher({ users, selectedUserId, onChange }: UserRoleSwitcherProps) {
  return (
    <label className="user-switcher">
      <span>사용자 전환</span>
      <select onChange={(event) => onChange(event.target.value)} value={selectedUserId}>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} / {user.role}
          </option>
        ))}
      </select>
    </label>
  )
}
