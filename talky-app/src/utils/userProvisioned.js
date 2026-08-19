import { createContext, useContext } from 'react'

// Whether POST /api/user/adduser has come back for the signed-in user.
//
// Nothing else on the server creates a user document, so any route that looks
// the user up (lessons, student detail, ...) 404s until that POST lands. React
// runs child effects before parent ones, so without this gate the dashboard's
// GETs are guaranteed to go out *before* the create call that UserCreator
// makes above them.
export const UserProvisionedContext = createContext(false)

export function useUserProvisioned() {
  return useContext(UserProvisionedContext)
}
