import { NavLink } from 'react-router-dom'

export default function Navbar() {
  return (
    <nav className="navbar">
      <span className="navbar-brand">IMSA <span>Intel</span></span>
      <div className="navbar-links">
        <NavLink to="/compare" className={({ isActive }) => isActive ? 'active primary' : 'primary'}>
          ⚡ Compare
        </NavLink>
        <NavLink to="/drivers" className={({ isActive }) => isActive ? 'active' : ''}>Drivers</NavLink>
        <NavLink to="/circuits" className={({ isActive }) => isActive ? 'active' : ''}>Circuits</NavLink>
      </div>
    </nav>
  )
}
