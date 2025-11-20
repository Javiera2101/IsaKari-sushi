import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase.js'; 
import { 
  collection, getDocs, addDoc, updateDoc, 
  doc, Timestamp, query, where
} from 'firebase/firestore'; 

// --- IMPORTACIONES DE ESTILOS ---
import './css/bootstrap.min.css'; 
import './css/App.css'; 
import 'bootstrap-icons/font/bootstrap-icons.css'; 

import { useReactToPrint } from 'react-to-print';
import { Ticket } from './Ticket.jsx'; 

export const TomarPedido = ({ ordenAEditar, onTerminarEdicion }) => { 

  const [menu, setMenu] = useState([]);
  
  // Estados inicializados
  const [orden, setOrden] = useState(ordenAEditar ? ordenAEditar.items : []);
  const [numeroPedido, setNumeroPedido] = useState(1); 
  const [tipoEntrega, setTipoEntrega] = useState(ordenAEditar ? (ordenAEditar.tipo_entrega || 'LOCAL') : 'LOCAL');
  
  // Nota general del pedido (opcional, si quieres mantenerla además de las individuales)
  const [descripcion, setDescripcion] = useState(ordenAEditar ? (ordenAEditar.descripcion || '') : '');
  
  const [setMesa] = useState(ordenAEditar ? (ordenAEditar.mesa || '') : ''); 
  
  const [vista, setVista] = useState('CATEGORIAS');
  const [categoriaActual, setCategoriaActual] = useState('');
  const [fechaHora, setFechaHora] = useState('');
  
  const [cajaAbierta, setCajaAbierta] = useState(true);
  
  // ESTADO PARA LA VISTA PREVIA
  const [mostrarVistaPrevia, setMostrarVistaPrevia] = useState(false);

  // Estado para controlar qué producto se está editando (observación)
  const [editandoObservacionId, setEditandoObservacionId] = useState(null);
  const [observacionTemp, setObservacionTemp] = useState('');

  const componentRef = useRef(null);

  const handlePrint = useReactToPrint({
    contentRef: componentRef, 
    content: () => componentRef.current,
    onAfterPrint: () => {
      if (!ordenAEditar) {
          setOrden([]);
          setMesa(''); 
          setDescripcion('');
          setTipoEntrega('LOCAL');
          setNumeroPedido(prev => prev + 1);
          volverACategorias();
      } else {
          onTerminarEdicion();
      }
      setMostrarVistaPrevia(false); 
    }
  });

  useEffect(() => {
    const inicializarDatos = async () => {
      const menuSnapshot = await getDocs(collection(db, "menu"));
      const listaMenu = menuSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMenu(listaMenu);

      if (!ordenAEditar) {
        try {
          const hoy = new Date();
          let inicioDia = new Date(hoy);
          inicioDia.setHours(0, 0, 0, 0); 
          let finDia = new Date(hoy);
          finDia.setDate(finDia.getDate() + 1); 
          finDia.setHours(0, 0, 0, 0);
          
          const inicioDiaTS = Timestamp.fromDate(inicioDia);
          const finDiaTS = Timestamp.fromDate(finDia);

          const qCaja = query(
              collection(db, "cajas"),
              where("estado", "==", "abierta"),
              where("fecha_apertura", ">=", inicioDiaTS),
              where("fecha_apertura", "<", finDiaTS)
          );
          
          const cajaSnapshot = await getDocs(qCaja);
          let inicioTurnoTS = null;
          
          if (!cajaSnapshot.empty) {
              const cajaActiva = cajaSnapshot.docs[0].data();
              inicioTurnoTS = cajaActiva.fecha_apertura;
              setCajaAbierta(true); 
          } else {
              inicioTurnoTS = inicioDiaTS; 
              setCajaAbierta(false); 
          }

          const qOrdenes = query(
            collection(db, "ordenes"),
            where("fecha", ">=", inicioTurnoTS),
            where("fecha", "<", finDiaTS) 
          );

          const querySnapshot = await getDocs(qOrdenes);

          if (!querySnapshot.empty) {
            let maxPedido = 0;
            querySnapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.numero_pedido > maxPedido) {
                    maxPedido = data.numero_pedido;
                }
            });
            setNumeroPedido(maxPedido + 1);
          } else {
            setNumeroPedido(1);
          }
        } catch (error) {
          console.error("Error obteniendo último número:", error);
          setNumeroPedido(1); 
          setCajaAbierta(false);
        }
      } 
    };

    inicializarDatos();
  }, [ordenAEditar]); 

  const enviarCocina = async (imprimir = false) => {
    if (orden.length === 0) return alert("Orden vacía");
    
    if (!cajaAbierta && !ordenAEditar) {
        return alert("⛔ ERROR: No es posible confirmar un nuevo pedido. Debe iniciar el turno de caja.");
    }
    
    const totalCalculado = orden.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
    
    const ahora = new Date();
    const fechaStr = ahora.toLocaleDateString('es-CL') + ' ' + ahora.toLocaleTimeString('es-CL', {hour: '2-digit', minute:'2-digit'});
    setFechaHora(fechaStr);

    try {
        if (ordenAEditar) {
            const ordenRef = doc(db, "ordenes", ordenAEditar.id);
            let nuevaMesa = ordenAEditar.mesa;
            if (ordenAEditar.tipo_entrega !== tipoEntrega) {
                nuevaMesa = tipoEntrega === 'LOCAL' ? 'Local' : '';
            }

            await updateDoc(ordenRef, {
                items: orden,
                total: totalCalculado,
                tipo_entrega: tipoEntrega,
                mesa: nuevaMesa,
                descripcion: descripcion
            });
            alert("¡Orden ACTUALIZADA!");
        } else {
            await addDoc(collection(db, "ordenes"), {
                numero_pedido: numeroPedido,
                mesa: tipoEntrega === 'LOCAL' ? 'Local' : '', 
                tipo_entrega: tipoEntrega,
                items: orden,
                total: totalCalculado,
                estado: "pendiente",
                fecha: Timestamp.now(),
                descripcion: descripcion
            });
            alert("¡Orden CREADA!");
        }
        
        if (imprimir) {
            handlePrint();
        } else {
             if (!ordenAEditar) {
                setOrden([]);
                setMesa(''); 
                setDescripcion('');
                setTipoEntrega('LOCAL');
                setNumeroPedido(prev => prev + 1);
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

  const formatoPeso = (valor) => valor.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });
  const categoriasUnicas = [...new Set(menu.map(item => item.categoria))];
  const productosFiltrados = menu.filter(item => item.categoria === categoriaActual);
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

  return (
    <div className="container-fluid h-100 bg-dark overflow-hidden">
      <div className="row h-100">
        
        <div className="col-8 h-100 d-flex flex-column p-3">
           {!cajaAbierta && !ordenAEditar ? (
              <div className="d-flex h-100 align-items-center justify-content-center text-center">
                  <div className="p-5 bg-secondary text-white rounded shadow">
                    <i className="bi bi-box-fill display-1 mb-3"></i>
                    <h2 className="fw-bold">CAJA CERRADA</h2>
                    <p className="lead">No es posible tomar nuevos pedidos hasta que inicies el turno de caja.</p>
                    <p className="mt-3">Ve a la sección "Caja / Cierre" para iniciar un nuevo turno.</p>
                  </div>
              </div>
          ) : (
            <>
                {!cajaAbierta && ordenAEditar && (
                    <div className="alert alert-warning text-center mb-3">
                        <i className="bi bi-exclamation-triangle-fill me-2"></i> ADVERTENCIA: La caja está cerrada, pero puedes guardar esta edición.
                    </div>
                )}
                
                {vista === 'CATEGORIAS' ? (
                    <div className="h-100 d-flex flex-column">
                    <h2 className="text-white mb-4 text-center">Seleccione Categoría</h2>
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

        <div className="col-4 h-100 bg-white d-flex flex-column p-0 border-start">
          
          <div className={`p-3 border-bottom ${ordenAEditar ? 'bg-success-subtle' : 'bg-light'}`}>
             <div className="d-flex justify-content-between align-items-center mb-3">
              <h4 className="m-0 fw-bold">
                {ordenAEditar ? <><i className="bi bi-pencil-fill me-2"></i>EDITANDO</> : 'Orden Actual'}
              </h4>
              <div className="bg-dark text-white px-3 py-1 rounded fs-4 fw-bold">
                #{numeroPedido}
              </div>
            </div>
            
            {ordenAEditar && (
                 <div className="alert alert-secondary text-center fw-bold mb-2">
                    Estás editando un pedido existente.
                 </div>
            )}

            {ordenAEditar && (
                <button className="btn btn-sm btn-danger w-100 mb-2 fw-bold" onClick={onTerminarEdicion}>
                    <i className="bi bi-x-circle me-2"></i>CANCELAR EDICIÓN
                </button>
            )}

            <div className="btn-group w-100" role="group">
                <button type="button" className={`btn py-3 fw-bold ${tipoEntrega === 'LOCAL' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setTipoEntrega('LOCAL')}><i className="bi bi-shop-window fs-4 me-2"></i>LOCAL</button>
                <button type="button" className={`btn py-3 fw-bold ${tipoEntrega === 'REPARTO' ? 'btn-warning' : 'btn-outline-secondary'}`} onClick={() => setTipoEntrega('REPARTO')}><i className="bi bi-car-front-fill fs-4 me-2"></i>REPARTO</button>
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
                              <small className="text-muted d-block fst-italic" style={{fontSize: '0.75rem'}}>{item.descripcion_producto}</small>
                          )}
                          <small className="text-muted">{formatoPeso(item.precio)} c/u</small>
                      </div>
                      <div className="text-end">
                          <div className="fw-bold">{formatoPeso(item.precio * item.cantidad)}</div>
                          <button 
                              className={`btn btn-sm ${item.observacion ? 'btn-warning text-dark' : 'btn-outline-secondary'} mt-1 py-0 px-2`} 
                              onClick={() => iniciarEdicionObservacion(item)}
                              title="Agregar observación al producto"
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
                        <button className="btn btn-sm btn-link text-danger fw-bold px-3 text-decoration-none" onClick={() => ajustarCantidad(item.id, -1)}>−</button>
                        <span className="fw-bold mx-2 fs-5">{item.cantidad}</span>
                        <button className="btn btn-sm btn-link text-success fw-bold px-3 text-decoration-none" onClick={() => ajustarCantidad(item.id, 1)}>+</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-3 bg-light border-top shadow-sm">

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
            />
        </div>
      </div>
    </div>
  );
};