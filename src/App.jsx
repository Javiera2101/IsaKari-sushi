import React, { useState, useEffect } from 'react';
import './css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css'; 
import './css/App.css'; 
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';

import { TomarPedido } from './TomarPedido.jsx';
import { MesasActivas } from './MesasActivas.jsx';
import { Caja } from './Caja.jsx';

import { auth } from './firebase.js'; 

// IMPORTACIÓN DE LOGOS
import logoColor from './images/logoColor.png';
import logo from './images/logo.png';

// Componente para la pantalla de inicio de sesión
const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async () => {
        setError('');
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (e) {
            console.error(e);
            if (e.code === 'auth/invalid-email' || e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
                setError('Credenciales inválidas. Verifica tu email y contraseña.');
            } else {
                setError('Error al iniciar sesión. Intenta de nuevo.');
            }
        }
    };

    return (
        <div className="d-flex justify-content-center align-items-center vh-100 bg-dark">
            <div className="card p-4 shadow-lg text-center" style={{ width: '400px' }}>
                {/* LOGO COLOR EN LOGIN */}
                <div className="mb-4">
                    <img 
                        src={logoColor} 
                        alt="Logo IsaKari Sushi" 
                        className="img-fluid rounded" 
                        style={{ maxHeight: '180px' }} 
                    />
                </div>

                <h2 className="mb-4 fw-bold text-primary">Iniciar Sesión</h2>
                {error && <div className="alert alert-danger">{error}</div>}
                <div className="mb-3 text-start">
                    <label className="form-label">Email:</label>
                    <input 
                        type="email" 
                        className="form-control" 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="ejemplo@sushi.cl"
                    />
                </div>
                <div className="mb-3 text-start">
                    <label className="form-label">Contraseña:</label>
                    <input 
                        type="password" 
                        className="form-control" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => {if(e.key === 'Enter') handleLogin()}}
                        placeholder="••••••••"
                    />
                </div>
                <button 
                    className="btn btn-primary btn-lg fw-bold mt-3 w-100" 
                    onClick={handleLogin}
                >
                    <i className="bi bi-box-arrow-in-right me-2"></i> INGRESAR
                </button>
            </div>
        </div>
    );
};


function App() {
  const [seccion, setSeccion] = useState('PEDIDO'); 
  const [ordenParaEditar, setOrdenParaEditar] = useState(null);
  
  const [user, setUser] = useState(null); 
  const [loading, setLoading] = useState(true); 

  // Listener de autenticación para cargar el usuario
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        setLoading(false);
    });
    return unsubscribe; 
  }, []);

  const handleLogout = async () => {
    try {
        await signOut(auth);
        setSeccion('PEDIDO'); // Regresa a una sección neutral al salir
    } catch (e) {
        console.error("Error al cerrar sesión:", e);
    }
  };

  const handleEditarMesa = (orden) => {
    setOrdenParaEditar(orden);
    setSeccion('PEDIDO');
  };

  const handleTerminarEdicion = () => {
    setOrdenParaEditar(null);
    setSeccion('MESAS'); 
  };

  const irANuevoPedido = () => {
    setOrdenParaEditar(null);
    setSeccion('PEDIDO');
  }

  if (loading) {
      return <div className="d-flex justify-content-center align-items-center vh-100"><div className="spinner-border text-primary" role="status"></div></div>;
  }

  // --- RENDERIZADO CONDICIONAL: SI NO HAY USUARIO, MUESTRA LOGIN ---
  if (!user) {
    return <Login />;
  }
  // --- FIN RENDERIZADO CONDICIONAL ---


  return (
    <div className="d-flex flex-column vh-100">
      
      {/* --- BARRA DE NAVEGACIÓN --- */}
      {/* Aumentamos la altura mínima para que quepa el logo grande */}
      <nav className="navbar navbar-dark bg-dark px-3 border-bottom border-secondary" style={{minHeight: '90px'}}>
        
        {/* LOGO VERTICAL EN ENCABEZADO */}
        <a className="navbar-brand d-flex align-items-center" href="#">
            <img 
                src={logo} 
                alt="IsaKari" 
                // AUMENTADO: De 50px a 80px de alto y ajustado estilo
                style={{ maxHeight: '80px', width: 'auto', padding: '2px' }} 
                className="d-inline-block align-top rounded me-2"
            />
        </a>
        
        <div className="d-flex gap-2 align-items-center">
            <span className="text-white me-3 d-none d-md-inline small text-truncate" style={{maxWidth: '150px'}}>
                <i className="bi bi-person-fill me-1"></i> {user.email}
            </span>
          
          <button 
            className={`btn ${seccion === 'PEDIDO' ? 'btn-warning' : 'btn-outline-secondary'}`}
            onClick={irANuevoPedido}
          >
            <i className={`bi ${ordenParaEditar ? 'bi-pencil-square' : 'bi bi-plus-lg'} me-2`}></i>
            {ordenParaEditar ? 'Editando...' : 'Agendar Pedido'}
          </button>
          
          <button 
            className={`btn ${seccion === 'MESAS' ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setSeccion('MESAS')}
          >
            <i className="bi bi-fork-knife"> </i> 
            Mesas Activas
          </button>
          
          <button 
            className={`btn ${seccion === 'CAJA' ? 'btn-info text-white' : 'btn-outline-secondary'}`}
            onClick={() => setSeccion('CAJA')}
          >
            <i className="bi bi-cash-coin me-2"></i>
            Caja / Cierre
          </button>
          
          <button 
            className="btn btn-outline-danger ms-3"
            onClick={handleLogout}
            title="Cerrar Sesión"
          >
            <i className="bi bi-box-arrow-right"></i>
          </button>

        </div>
      </nav>
      {/* --- FIN BARRA NAVEGACIÓN --- */}

      <div className="flex-grow-1 overflow-hidden">
        {seccion === 'PEDIDO' && (
          <TomarPedido 
            key={ordenParaEditar ? ordenParaEditar.id : 'nueva-orden'} 
            ordenAEditar={ordenParaEditar}        
            onTerminarEdicion={handleTerminarEdicion} 
          />
        )}
        
        {seccion === 'MESAS' && (
          <MesasActivas 
            onEditar={handleEditarMesa} 
          />
        )}
        
        {seccion === 'CAJA' && <Caja user={user} />}
      </div>
    </div>
  );
}

export default App;