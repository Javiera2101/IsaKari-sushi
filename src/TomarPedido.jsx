import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from './firebase.js'; 
import { 
  collection, getDocs, addDoc, updateDoc, 
  doc, Timestamp, query, where, limit
} from 'firebase/firestore'; 

import './css/bootstrap.min.css'; 
import './css/App.css'; 
import 'bootstrap-icons/font/bootstrap-icons.css'; 

import { useReactToPrint } from 'react-to-print';
import { Ticket } from './Ticket.jsx'; 

export const TomarPedido = ({ ordenAEditar, onTerminarEdicion }) => { 

  const [menu, setMenu] = useState([]);
  
  // Helper para obtener hora actual en formato HH:MM
  const obtenerHoraActual = () => {
    const ahora = new Date();
    return ahora.toLocaleTimeString('es-CL', {hour: '2-digit', minute:'2-digit'});
  };

  // Estados inicializados
  const [orden, setOrden] = useState(ordenAEditar ? ordenAEditar.items : []);
  const [numeroPedido, setNumeroPedido] = useState(ordenAEditar ? ordenAEditar.numero_pedido : 1); 
  const [tipoEntrega, setTipoEntrega] = useState(ordenAEditar ? (ordenAEditar.tipo_entrega || 'LOCAL') : 'LOCAL');
  
  // NUEVOS ESTADOS: Nombre Cliente y Hora
  const [nombreCliente, setNombreCliente] = useState(ordenAEditar ? (ordenAEditar.nombre_cliente || '') : '');
  const [horaPedido, setHoraPedido] = useState(ordenAEditar ? (ordenAEditar.hora_pedido || '') : obtenerHoraActual());

  // Estado para Observaciones Generales
  const [descripcion, setDescripcion] = useState(ordenAEditar ? (ordenAEditar.descripcion || '') : '');
  
  const [setMesa] = useState(ordenAEditar ? (ordenAEditar.mesa || '') : ''); 
  
  const [vista, setVista] = useState('CATEGORIAS');
  const [categoriaActual, setCategoriaActual] = useState('');
  const [fechaHora, setFechaHora] = useState('');
  
  // CONTROL DE CAJA Y CARGA
  const [cajaAbierta, setCajaAbierta] = useState(false); // Por defecto cerrada
  const [cargando, setCargando] = useState(true); // Cargando por defecto
  
  const [mostrarVistaPrevia, setMostrarVistaPrevia] = useState(false);

  // Estado para edición de observaciones por producto
  const [editandoObservacionId, setEditandoObservacionId] = useState(null);
  const [observacionTemp, setObservacionTemp] = useState('');

  const componentRef = useRef(null);
  
  // --- MODO PRUEBA ---
  const emailUsuario = auth.currentUser ? auth.currentUser.email : "";
  const esPrueba = emailUsuario === "prueba@isakari.com";
  const COL_CAJAS = esPrueba ? "cajas_pruebas" : "cajas";
  const COL_ORDENES = esPrueba ? "ordenes_pruebas" : "ordenes";

  const handlePrint = useReactToPrint({
    contentRef: componentRef, 
    content: () => componentRef.current,
    onAfterPrint: () => {
      if (!ordenAEditar) {
          setOrden([]);
          setMesa(''); 
          setDescripcion('');
          setNombreCliente(''); // Limpiar nombre
          setHoraPedido(obtenerHoraActual()); // Resetear hora
          setTipoEntrega('LOCAL');
          // Recalcular número de pedido si es necesario
          // setNumeroPedido(prev => prev + 1); 
          volverACategorias();
      } else {
          onTerminarEdicion();
      }
      setMostrarVistaPrevia(false); 
    }
  });

  useEffect(() => {
    const inicializarDatos = async () => {
      setCargando(true);
      try {
        // 1. Cargar Menú (siempre el mismo) y Verificar Caja (dinámica)
        const promesaMenu = getDocs(collection(db, "menu"));
        
        // Usamos COL_CAJAS dinámico
        const qCaja = query(
            collection(db, COL_CAJAS),
            where("estado", "==", "abierta"),
            limit(1)
        );
        const promesaCaja = getDocs(qCaja);

        const [menuSnapshot, cajaSnapshot] = await Promise.all([promesaMenu, promesaCaja]);

        // Procesar Menú
        const listaMenu = menuSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMenu(listaMenu);

        // Procesar Caja
        if (!cajaSnapshot.empty) {
            setCajaAbierta(true);
            
            // Si es un pedido nuevo, calculamos el folio basado en la caja y colección correcta
            if (!ordenAEditar) {
                const cajaData = cajaSnapshot.docs[0].data();
                const inicioTurnoTS = cajaData.fecha_apertura;

                // Usamos COL_ORDENES dinámico
                const qOrdenes = query(
                  collection(db, COL_ORDENES),
                  where("fecha", ">=", inicioTurnoTS)
                );

                const querySnapshot = await getDocs(qOrdenes);
                let maxPedido = 0;
                querySnapshot.docs.forEach(doc => {
                    const data = doc.data();
                    if (data.numero_pedido > maxPedido) {
                        maxPedido = data.numero_pedido;
                    }
                });
                setNumeroPedido(maxPedido + 1);
            }
        } else {
            setCajaAbierta(false); 
        }
      } catch (error) {
          console.error("Error inicializando:", error);
          setCajaAbierta(false);
      } finally {
          setCargando(false);
      }
    };

    inicializarDatos();
  }, [ordenAEditar, COL_CAJAS, COL_ORDENES]); 

  // --- GUARDAR PEDIDO ---
  const enviarCocina = async (imprimir = false) => {
    if (orden.length === 0) return alert("Orden vacía");
    
    // Validación estricta
    if (!cajaAbierta && !ordenAEditar) {
        return alert("⛔ ERROR: No es posible confirmar un nuevo pedido. Debe iniciar el turno de caja.");
    }
    
    const totalCalculado = orden.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
    
    const ahora = new Date();
    const fechaStr = ahora.toLocaleDateString('es-CL') + ' ' + ahora.toLocaleTimeString('es-CL', {hour: '2-digit', minute:'2-digit'});
    setFechaHora(fechaStr);

    try {
        if (ordenAEditar) {
            // ACTUALIZAR (Usamos COL_ORDENES dinámico)
            const ordenRef = doc(db, COL_ORDENES, ordenAEditar.id);
            let nuevaMesa = ordenAEditar.mesa;
            if (ordenAEditar.tipo_entrega !== tipoEntrega) {
                nuevaMesa = tipoEntrega === 'LOCAL' ? 'Local' : '';
            }

            await updateDoc(ordenRef, {
                items: orden,
                total: totalCalculado,
                tipo_entrega: tipoEntrega,
                mesa: nuevaMesa,
                descripcion: descripcion,
                nombre_cliente: nombreCliente, // Guardamos nombre
                hora_pedido: horaPedido,       // Guardamos hora
                editado_por_id: auth.currentUser ? auth.currentUser.uid : "anonimo",
                editado_por_email: emailUsuario
            });
            alert("¡Orden ACTUALIZADA!");
        } else {
            // CREAR NUEVO (Usamos COL_ORDENES dinámico)
            await addDoc(collection(db, COL_ORDENES), {
                numero_pedido: numeroPedido,
                mesa: tipoEntrega === 'LOCAL' ? 'Local' : '', 
                tipo_entrega: tipoEntrega,
                items: orden,
                total: totalCalculado,
                estado: "pendiente",
                fecha: Timestamp.now(),
                descripcion: descripcion,
                nombre_cliente: nombreCliente, // Guardamos nombre
                hora_pedido: horaPedido,       // Guardamos hora
                usuario_id: auth.currentUser ? auth.currentUser.uid : "anonimo",
                usuario_email: emailUsuario
            });

            if (esPrueba) {
                alert("🛠️ ¡Pedido de PRUEBA guardado! (No afectará la caja real)");
            } else {
                alert("¡Orden CREADA!");
            }
        }
        
        if (imprimir) {
            handlePrint();
        } else {
             if (!ordenAEditar) {
                setOrden([]);
                setMesa(''); 
                setDescripcion('');
                setNombreCliente(''); // Limpiar nombre
                setHoraPedido(obtenerHoraActual()); // Resetear hora
                setTipoEntrega('LOCAL');
                volverACategorias();
             } else {
                onTerminarEdicion();
             }
        }

    } catch (e) {
        console.error(e);
        alert("Error al guardar/actualizar");
    }
  };

  // --- HELPERS ---
  const formatoPeso = (valor) => valor.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });
  const categoriasUnicas = [...new Set(menu.map(item => item.categoria))];
  
  // ===========================================================================
  // AQUÍ ESTÁ EL CAMBIO: Agregamos .sort() para ordenar por precio (menor a mayor)
  // Esto hará que salgan en orden: 20 cortes, 30 cortes, 40 cortes...
  // ===========================================================================
  const productosFiltrados = menu
    .filter(item => item.categoria === categoriaActual)
    .sort((a, b) => a.precio - b.precio);

  const abrirCategoria = (cat) => { setCategoriaActual(cat); setVista('PRODUCTOS'); };
  const volverACategorias = () => { setVista('CATEGORIAS'); setCategoriaActual(''); };

  const agregarAlPedido = (producto) => {
    if (!cajaAbierta && !ordenAEditar) return alert("⛔ Caja cerrada. Inicie el turno para agregar productos.");
    
    const existe = orden.find(item => item.id === producto.id);
    if (existe) {
      const nuevaOrden = orden.map(item => 
        item.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item
      );
      setOrden(nuevaOrden);
    } else {
      setOrden([...orden, { 
          ...producto, 
          cantidad: 1, 
          observacion: '', 
          descripcion_producto: producto.descripcion || '' 
      }]);
    }
  };

  const ajustarCantidad = (id, delta) => {
    if (!cajaAbierta && !ordenAEditar) return alert("⛔ Caja cerrada. No se pueden hacer ajustes.");
    
    const nuevaOrden = orden.map(item => {
      if (item.id === id) return { ...item, cantidad: Math.max(0, item.cantidad + delta) };
      return item;
    });
    setOrden(nuevaOrden.filter(item => item.cantidad > 0));
  };

  const iniciarEdicionObservacion = (item) => {
      setEditandoObservacionId(item.id);
      setObservacionTemp(item.observacion || '');
  };

  const guardarObservacion = (id) => {
      const nuevaOrden = orden.map(item => {
          if (item.id === id) return { ...item, observacion: observacionTemp };
          return item;
      });
      setOrden(nuevaOrden);
      setEditandoObservacionId(null);
  };

  const total = orden.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);

  const abrirVistaPrevia = () => {
      if (orden.length === 0) return alert("Orden vacía");
      const ahora = new Date();
      const fechaStr = ahora.toLocaleDateString('es-CL') + ' ' + ahora.toLocaleTimeString('es-CL', {hour: '2-digit', minute:'2-digit'});
      setFechaHora(fechaStr);
      setMostrarVistaPrevia(true);
  };

  // --- RENDERIZADO DE CARGA ---
  if (cargando) {
      return (
          <div className="d-flex h-100 align-items-center justify-content-center bg-dark text-white">
              <div className="spinner-border text-warning" role="status" style={{width: '3rem', height: '3rem'}}>
                  <span className="visually-hidden">Cargando...</span>
              </div>
          </div>
      );
  }

  // --- RENDERIZADO PRINCIPAL ---
  return (
    <div className="container-fluid h-100 bg-dark overflow-hidden">
      <div className="row h-100">
        
        <div className="col-8 h-100 d-flex flex-column p-3">
          
          {/* --- PANTALLA DE BLOQUEO (CAJA CERRADA) --- */}
          {!cajaAbierta && !ordenAEditar ? (
              <div className="d-flex h-100 flex-column align-items-center justify-content-center text-center">
                  <div className="p-5 bg-secondary text-white rounded shadow" style={{border: '4px solid #dc3545', maxWidth: '80%'}}>
                    <i className="bi bi-door-closed-fill display-1 mb-3 text-danger"></i>
                    <h1 className="fw-bold display-5">CAJA NO INICIADA</h1>
                    {esPrueba && <span className="badge bg-danger mb-3">MODO PRUEBA</span>}
                    <p className="lead mt-3">Para comenzar a tomar pedidos, primero debes iniciar el turno.</p>
                    <hr className="my-4" />
                    <p className="fw-bold text-warning fs-5">
                        <i className="bi bi-arrow-right-circle me-2"></i>
                        Ve a la sección "Caja / Cierre" para abrir la caja.
                    </p>
                  </div>
              </div>
          ) : (
            <>
                {/* Alerta sutil si estamos editando con caja cerrada */}
                {!cajaAbierta && ordenAEditar && (
                    <div className="alert alert-warning text-center mb-3 py-2 fw-bold">
                        <i className="bi bi-exclamation-triangle-fill me-2"></i> 
                        Estás editando un pedido, pero la caja del día está cerrada.
                    </div>
                )}

                {/* --- VISTA NORMAL DEL MENÚ --- */}
                {vista === 'CATEGORIAS' ? (
                    <div className="h-100 d-flex flex-column">
                    <h2 className="text-white mb-4 text-center">
                        Seleccione Categoría 
                        {esPrueba && <span className="badge bg-danger ms-2 fs-6">MODO PRUEBA</span>}
                    </h2>
                    <div className="grid-5x5 flex-grow-1 overflow-auto">
                        {categoriasUnicas.map(cat => (
                        <button key={cat} className="btn btn-outline-light btn-categoria-grande" onClick={() => abrirCategoria(cat)}>
                            {cat}
                        </button>
                        ))}
                    </div>
                    </div>
                ) : (
                    <div className="h-100 d-flex flex-column">
                    <div className="d-flex align-items-center mb-3 pb-2 border-bottom border-secondary">
                        <button className="btn btn-secondary btn-lg me-3 fw-bold" onClick={volverACategorias}><i className="bi bi-arrow-left-short"></i> VOLVER</button>
                        <h2 className="text-warning m-0">{categoriaActual}</h2>
                    </div>
                    <div className="grid-5x5 flex-grow-1 overflow-auto">
                        {productosFiltrados.map((item) => (
                        <button key={item.id} className="btn-producto-pos" onClick={() => agregarAlPedido(item)}>
                            <span className="nombre-producto">{item.nombre}</span>
                            <span className="precio-producto">{formatoPeso(item.precio)}</span>
                        </button>
                        ))}
                    </div>
                    </div>
                )}
            </>
          )}
        </div>

        {/* COLUMNA DERECHA (TICKET) */}
        <div className="col-4 h-100 bg-white d-flex flex-column p-0 border-start">
          
          <div className={`p-3 border-bottom ${ordenAEditar ? 'bg-success-subtle' : 'bg-light'}`}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                  <h4 className="m-0 fw-bold">
                    {ordenAEditar ? <><i className="bi bi-pencil-fill me-2"></i>EDITANDO</> : 'Orden Actual'}
                  </h4>
                  {/* Mostrar mesa si se está editando */}
                  {ordenAEditar && ordenAEditar.mesa && ordenAEditar.mesa !== 'Local' && (
                      <small className="text-muted fw-bold">Mesa: {ordenAEditar.mesa}</small>
                  )}
              </div>
              <div className="bg-dark text-white px-3 py-1 rounded fs-4 fw-bold">
                #{numeroPedido}
              </div>
            </div>
            
            {ordenAEditar && (
                <button className="btn btn-sm btn-danger w-100 mb-2 fw-bold" onClick={onTerminarEdicion}>
                    <i className="bi bi-x-circle me-2"></i>CANCELAR EDICIÓN
                </button>
            )}

            <div className="btn-group w-100" role="group">
                <button 
                    type="button" 
                    className={`btn py-3 fw-bold ${tipoEntrega === 'LOCAL' ? 'btn-primary' : 'btn-outline-secondary'}`} 
                    onClick={() => setTipoEntrega('LOCAL')}
                    disabled={!cajaAbierta && !ordenAEditar}
                >
                    <i className="bi bi-shop-window fs-4 me-2"></i>LOCAL
                </button>
                <button 
                    type="button" 
                    className={`btn py-3 fw-bold ${tipoEntrega === 'REPARTO' ? 'btn-warning' : 'btn-outline-secondary'}`} 
                    onClick={() => setTipoEntrega('REPARTO')}
                    disabled={!cajaAbierta && !ordenAEditar}
                >
                    <i className="bi bi-car-front-fill fs-4 me-2"></i>REPARTO
                </button>
            </div>
          </div>

          <div className="flex-grow-1 overflow-auto p-3">
             {orden.length === 0 ? (
              <div className="text-center mt-5 text-muted"><h5>Sin productos</h5></div>
            ) : (
              <ul className="list-group list-group-flush">
                {orden.map((item) => (
                  <li key={item.id} className="list-group-item px-0 py-2 border-bottom">
                    
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <div className="flex-grow-1 me-2">
                          <span className="fw-bold d-block">{item.nombre}</span>
                          
                          {item.descripcion_producto && (
                                <small className="text-muted d-block fst-italic" style={{fontSize: '0.75rem'}}>
                                    {/* Verificamos si es un Array (lista) o texto normal */}
                                    {Array.isArray(item.descripcion_producto) 
                                        ? item.descripcion_producto.map((linea, index) => (
                                            <span key={index} className="d-block">
                                                • {linea}
                                            </span>
                                            ))
                                        : item.descripcion_producto /* Caso fallback si sigue siendo string */
                                    }
                                </small>
                            )}
                           <small className="text-muted">{formatoPeso(item.precio)} c/u</small>
                      </div>
                      <div className="text-end">
                          <div className="fw-bold">{formatoPeso(item.precio * item.cantidad)}</div>
                          <button 
                              className={`btn btn-sm ${item.observacion ? 'btn-warning text-dark' : 'btn-outline-secondary'} mt-1 py-0 px-2`} 
                              onClick={() => iniciarEdicionObservacion(item)}
                              title="Agregar observación al producto"
                              disabled={!cajaAbierta && !ordenAEditar}
                          >
                              <i className="bi bi-pencil-square"></i> {item.observacion ? 'Editar Nota' : 'Nota'}
                          </button>
                      </div>
                    </div>

                    {editandoObservacionId === item.id && (
                        <div className="input-group input-group-sm mb-2">
                            <input 
                                type="text" 
                                className="form-control" 
                                placeholder="Ej: Sin sésamo, Sin queso..." 
                                value={observacionTemp}
                                onChange={(e) => setObservacionTemp(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => { if(e.key === 'Enter') guardarObservacion(item.id) }}
                            />
                            <button className="btn btn-success" onClick={() => guardarObservacion(item.id)}>
                                <i className="bi bi-check"></i>
                            </button>
                        </div>
                    )}

                    {item.observacion && editandoObservacionId !== item.id && (
                        <div className="alert alert-warning py-1 px-2 mb-2 small fst-italic">
                            <i className="bi bi-info-circle me-1"></i> {item.observacion}
                        </div>
                    )}

                    <div className="d-flex justify-content-end">
                      <div className="d-flex align-items-center bg-light rounded border">
                        <button 
                            className="btn btn-sm btn-link text-danger fw-bold px-3 text-decoration-none" 
                            onClick={() => ajustarCantidad(item.id, -1)}
                            disabled={!cajaAbierta && !ordenAEditar}
                        >−</button>
                        <span className="fw-bold mx-2 fs-5">{item.cantidad}</span>
                        <button 
                            className="btn btn-sm btn-link text-success fw-bold px-3 text-decoration-none" 
                            onClick={() => ajustarCantidad(item.id, 1)}
                            disabled={!cajaAbierta && !ordenAEditar}
                        >+</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-3 bg-light border-top shadow-sm">
            
            {/* NUEVOS CAMPOS: NOMBRE Y HORA */}
            <div className="d-flex gap-2 mb-2">
                <input 
                    type="text" 
                    className="form-control fw-bold" 
                    placeholder="Nombre Cliente" 
                    value={nombreCliente} 
                    onChange={(e) => setNombreCliente(e.target.value)}
                    disabled={!cajaAbierta && !ordenAEditar}
                />
                <input 
                    type="time" 
                    className="form-control text-center" 
                    style={{width: '160px'}}
                    value={horaPedido} 
                    onChange={(e) => setHoraPedido(e.target.value)}
                    disabled={!cajaAbierta && !ordenAEditar}
                    title="Hora de entrega/retiro"
                />
            </div>

            <div className="mb-3">
                <textarea 
                    className="form-control" 
                    rows="2" 
                    placeholder="Observaciones generales (Ej: Envolver todo junto...)"
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    disabled={!cajaAbierta && !ordenAEditar}
                ></textarea>
            </div>

            <div className="d-flex justify-content-between mb-3">
              <span className="h3 text-dark">Total</span>
              <span className="h3 fw-bold text-success">{formatoPeso(total)}</span>
            </div>
            
            <div className="d-flex gap-2">
                <button 
                    className="btn btn-secondary flex-fill fw-bold py-3"
                    onClick={abrirVistaPrevia}
                    disabled={!cajaAbierta && !ordenAEditar}
                    title="Ver Vista Previa del Ticket"
                >
                    <i className="bi bi-eye-fill"></i>
                </button>

                <button 
                className={`btn flex-[3] btn-lg fw-bold py-3 ${ordenAEditar ? 'btn-primary' : (tipoEntrega === 'REPARTO' ? 'btn-warning text-dark' : 'btn-success text-white')}`} 
                onClick={() => enviarCocina(true)} 
                disabled={!cajaAbierta && !ordenAEditar}
                >
                {ordenAEditar ? (
                    <><i className="bi bi-floppy me-2"></i>GUARDAR</>
                ) : (tipoEntrega === 'REPARTO' ? (
                    <><i className="bi bi-floppy me-2"></i>CONFIRMAR</>
                ) : (
                    <><i className="bi bi-floppy me-2"></i>CONFIRMAR</>
                ))}
                </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DE VISTA PREVIA */}
      {mostrarVistaPrevia && (
          <div className="modal d-block" style={{backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999}}>
              <div className="modal-dialog modal-dialog-centered modal-sm">
                  <div className="modal-content">
                      <div className="modal-header bg-dark text-white py-2">
                          <h6 className="modal-title">Vista Previa Ticket</h6>
                          <button type="button" className="btn-close btn-close-white" onClick={() => setMostrarVistaPrevia(false)}></button>
                      </div>
                      <div className="modal-body p-0 d-flex justify-content-center bg-secondary">
                          <div className="bg-white p-2 my-3 shadow" style={{transform: 'scale(0.9)', transformOrigin: 'top center'}}>
                             <Ticket 
                                orden={orden}
                                total={total}
                                numeroPedido={numeroPedido}
                                tipoEntrega={tipoEntrega}
                                fecha={fechaHora || new Date().toLocaleDateString()} 
                                descripcion={descripcion}
                                cliente={nombreCliente} 
                                hora={horaPedido}       
                             />
                          </div>
                      </div>
                      <div className="modal-footer p-1">
                           <button className="btn btn-secondary btn-sm w-100" onClick={() => setMostrarVistaPrevia(false)}>Cerrar</button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* COMPONENTE OCULTO PARA IMPRESIÓN REAL */}
      <div style={{ height: 0, overflow: 'hidden' }}>
        <div ref={componentRef}>
            <Ticket 
            orden={orden}
            total={total}
            numeroPedido={numeroPedido}
            tipoEntrega={tipoEntrega}
            fecha={fechaHora}
            descripcion={descripcion}
            cliente={nombreCliente} 
            hora={horaPedido}       
            />
        </div>
      </div>
    </div>
  );
};