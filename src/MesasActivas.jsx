import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase'; 
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp } from 'firebase/firestore';
import './css/bootstrap.min.css';

export const MesasActivas = ({ onEditar }) => {
  const [pedidos, setPedidos] = useState([]);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  
  const [mostrandoPago, setMostrandoPago] = useState(false);
  const [metodoPago, setMetodoPago] = useState('EFECTIVO'); 
  const [mediosMixtosActivos, setMediosMixtosActivos] = useState([]);

  // Estado para el descuento
  const [descuento, setDescuento] = useState(0); 

  const [pagos, setPagos] = useState({
    efectivo: 0, debito: 0, transferencia: 0, edenred: 0
  });

  // --- LÓGICA MODO PRUEBA ---
  const emailUsuario = auth.currentUser ? auth.currentUser.email : "";
  const esPrueba = emailUsuario === "prueba@isakari.com";
  const COL_ORDENES = esPrueba ? "ordenes_pruebas" : "ordenes";

  // Diccionario de Iconos y Colores
  const configMedios = {
    'EFECTIVO':      { icon: 'bi-cash-stack', color: 'success' }, 
    'DEBITO':        { icon: 'bi-credit-card-2-front', color: 'primary' }, 
    'TRANSFERENCIA': { icon: 'bi-bank', color: 'info' }, 
    'EDENRED':       { icon: 'bi-ticket-perforated', color: 'warning' }, 
    'MIXTO':         { icon: 'bi-collection', color: 'secondary' } 
  };

  useEffect(() => {
    // Usamos COL_ORDENES dinámico aquí
    const q = query(collection(db, COL_ORDENES), where("estado", "==", "pendiente"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Ordenar por fecha (más antiguo primero)
      setPedidos(lista.sort((a, b) => a.fecha - b.fecha));
    });
    return () => unsubscribe();
  }, [COL_ORDENES]); 

  const formatoPeso = (valor) => valor.toLocaleString('es-CL', {style: 'currency', currency: 'CLP'});
  const calcularTotalOriginal = (items) => items.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);

  // --- LÓGICA DE ANULAR PEDIDO ---
  const anularPedido = async () => {
    if (!pedidoSeleccionado) return;

    const confirmacion = window.confirm(
        `⛔ ¿Estás seguro de ANULAR la Mesa ${pedidoSeleccionado.mesa || 'de Reparto'}?\n\nEsta acción sacará el pedido del sistema.`
    );

    if (confirmacion) {
      try {
        const ordenRef = doc(db, COL_ORDENES, pedidoSeleccionado.id);
        await updateDoc(ordenRef, {
            estado: "cancelado",
            fecha_cancelacion: Timestamp.now(),
            anulado_por: emailUsuario
        });
        setPedidoSeleccionado(null);
        if(esPrueba) alert("🛠️ Pedido de prueba anulado");
      } catch (e) {
        console.error("Error al anular:", e);
        alert("No se pudo anular el pedido.");
      }
    }
  };

  // --- CÁLCULO DE TOTALES CON DESCUENTO ---
  const obtenerTotalConDescuento = () => {
      if (!pedidoSeleccionado) return 0;
      const totalOriginal = calcularTotalOriginal(pedidoSeleccionado.items);
      const descNum = parseInt(descuento) || 0;
      const montoDescuento = Math.round(totalOriginal * (descNum / 100));
      return totalOriginal - montoDescuento;
  };

  // --- LÓGICA DE PAGO ---
  const handleInputPagoMixto = (metodoCambiado, valorRaw) => {
    const totalPagar = obtenerTotalConDescuento(); 
    const valorLimpio = valorRaw.replace(/\./g, '').replace(/[^0-9]/g, '');
    const nuevoValor = valorLimpio === '' ? 0 : parseInt(valorLimpio);

    let nuevosPagos = { ...pagos, [metodoCambiado]: nuevoValor };

    if (mediosMixtosActivos.length === 2) {
        const otroMetodo = mediosMixtosActivos.find(m => m !== metodoCambiado);
        const diferencia = totalPagar - nuevoValor;
        nuevosPagos[otroMetodo] = Math.max(0, diferencia);
    }
    setPagos(nuevosPagos);
  };

  const handleKeyDownInput = (e) => {
    if (e.key === 'Enter') {
        e.target.blur(); 
    }
  };

  const completarRestante = (metodoDestino) => {
      const totalPagar = obtenerTotalConDescuento();
      let sumaOtros = 0;
      Object.keys(pagos).forEach(key => {
          if (key !== metodoDestino && mediosMixtosActivos.includes(key)) {
              sumaOtros += pagos[key];
          }
      });
      setPagos({ ...pagos, [metodoDestino]: Math.max(0, totalPagar - sumaOtros) });
  };

  const toggleMedioMixto = (metodo) => {
    if (mediosMixtosActivos.includes(metodo)) {
        setMediosMixtosActivos(mediosMixtosActivos.filter(m => m !== metodo));
        setPagos({...pagos, [metodo]: 0}); 
    } else {
        setMediosMixtosActivos([...mediosMixtosActivos, metodo]);
    }
  };

  const procesarPago = async () => {
    if (!pedidoSeleccionado) return;
    
    const totalOriginal = calcularTotalOriginal(pedidoSeleccionado.items);
    const totalPagar = obtenerTotalConDescuento();
    const totalIngresado = pagos.efectivo + pagos.debito + pagos.transferencia + pagos.edenred;

    if (metodoPago === 'MIXTO' && totalIngresado !== totalPagar) {
      return alert(`⚠️ Montos descuadrados.\nTotal a Pagar: ${formatoPeso(totalPagar)}\nIngresado: ${formatoPeso(totalIngresado)}\nFaltan: ${formatoPeso(totalPagar - totalIngresado)}`);
    }

    let datosPago = {};
    if (metodoPago === 'MIXTO') {
      datosPago = { ...pagos };
    } else {
      datosPago[metodoPago.toLowerCase()] = totalPagar;
    }

    try {
      const ordenRef = doc(db, COL_ORDENES, pedidoSeleccionado.id);
      const descFinal = parseInt(descuento) || 0;

      await updateDoc(ordenRef, {
        estado: "pagado",
        fecha_cierre: Timestamp.now(),
        metodo_pago: metodoPago,
        desglose_pago: datosPago,
        total_original: totalOriginal, 
        descuento_porcentaje: descFinal, 
        total_final: totalPagar,
        cobrado_por: emailUsuario
      });
      
      setMostrandoPago(false);
      setPedidoSeleccionado(null);
      setPagos({ efectivo: 0, debito: 0, transferencia: 0, edenred: 0 });
      setMediosMixtosActivos([]);
      setDescuento(0);
      
      if(esPrueba) alert("🛠️ Pago de prueba registrado exitosamente");

    } catch (e) {
      console.error(e);
      alert("Error al cerrar mesa");
    }
  };

  // LISTENER GLOBAL PARA ENTER
  useEffect(() => {
    const handleGlobalEnter = (e) => {
        if (mostrandoPago && e.key === 'Enter') {
            if (document.activeElement.tagName === 'INPUT') return;
            if (metodoPago !== 'MIXTO') {
                e.preventDefault();
                procesarPago();
            }
        }
    };
    window.addEventListener('keydown', handleGlobalEnter);
    return () => window.removeEventListener('keydown', handleGlobalEnter);
  }, [mostrandoPago, metodoPago, pedidoSeleccionado, pagos, descuento]);

  const listaMedios = [
      { key: 'efectivo', label: ' Efectivo' },
      { key: 'debito', label: 'Débito' },
      { key: 'transferencia', label: 'Transf.' },
      { key: 'edenred', label: 'Junaeb' }
  ];
  
  const totalOriginal = pedidoSeleccionado ? calcularTotalOriginal(pedidoSeleccionado.items) : 0;
  const descNum = parseInt(descuento) || 0;
  const montoDescuento = pedidoSeleccionado ? Math.round(totalOriginal * (descNum / 100)) : 0;
  const totalPagar = totalOriginal - montoDescuento;

  const totalActual = pagos.efectivo + pagos.debito + pagos.transferencia + pagos.edenred;
  const faltaPorCubrir = totalPagar - totalActual;

  const abrirModalPago = () => {
      setDescuento(''); 
      setPagos({ efectivo: 0, debito: 0, transferencia: 0, edenred: 0 });
      setMetodoPago('EFECTIVO');
      setMediosMixtosActivos([]);
      setMostrandoPago(true);
  };

  return (
    <div className="container-fluid h-100 bg-light">
      <div className="row h-100">
        
        {/* COLUMNA IZQUIERDA */}
        <div className="col-4 border-end h-100 overflow-auto p-0 bg-white">
          <div className="p-3 bg-dark text-white d-flex justify-content-between align-items-center sticky-top">
              <h5 className="m-0 fw-bold">Pedidos Pendientes</h5>
              {esPrueba && <span className="badge bg-danger">MODO PRUEBA</span>}
          </div>
          
          <div className="list-group list-group-flush">
            {pedidos.length === 0 && (
                <div className="text-center p-4 text-muted">
                    No hay mesas ni pedidos pendientes.
                </div>
            )}
            {pedidos.map(p => {
              // Determinamos si este elemento está seleccionado para usarlo en los estilos
              const esSeleccionado = pedidoSeleccionado?.id === p.id;

              return (
                <button key={p.id} className={`list-group-item list-group-item-action py-3 ${esSeleccionado ? 'active' : ''}`} onClick={() => setPedidoSeleccionado(p)}>
                  <div className="d-flex w-100 justify-content-between">
                    <h5 className="mb-1 text-truncate">
                        {/* MOSTRAR EL NÚMERO DE PEDIDO AQUI */}
                        {/* Si está seleccionado, ponemos el badge blanco para contraste */}
                        <span className={`badge ${esSeleccionado ? 'bg-white text-dark' : 'bg-dark'} me-2`}>#{p.numero_pedido}</span>
                        
                        {/* LÓGICA PARA MOSTRAR NOMBRE O MESA */}
                        {p.nombre_cliente ? (
                          // AQUÍ EL CAMBIO: Si está seleccionado usamos 'text-white', si no 'text-primary'
                          <span className={`fw-bold text-uppercase ${esSeleccionado ? 'text-white' : 'text-primary'}`}>{p.nombre_cliente}</span>
                        ) : (
                          <span>Mesa {p.mesa || '?'}</span>
                        )}
                    </h5>
                    <small className="fw-bold">
                      {/* PRIORIZAR HORA MANUAL, SINO FECHA */}
                      {p.hora_pedido || (p.fecha ? new Date(p.fecha.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '')}
                    </small>
                  </div>
                  
                  <div className="d-flex justify-content-between align-items-center mt-1">
                      <div>
                          <span className={`badge ${p.tipo_entrega === 'REPARTO' ? 'bg-warning text-dark' : (esSeleccionado ? 'bg-light text-primary' : 'bg-light text-dark border')} me-2`}>
                              {p.tipo_entrega} {p.tipo_entrega === 'REPARTO' ? <i className="bi bi-car-front-fill"></i> : <i className="bi bi-shop"></i>}
                          </span>
                          {/* Si mostramos nombre arriba, mostramos la mesa aquí abajo (ajustando color si está seleccionado) */}
                          {p.nombre_cliente && <small className={`ms-1 ${esSeleccionado ? 'text-white-50' : 'text-muted'}`}>(Mesa {p.mesa})</small>}
                      </div>
                      <span className="fw-bold fs-6">{formatoPeso(p.total)}</span>
                  </div>

                  {p.usuario_email && p.usuario_email.includes('prueba') && (
                        <small className={`fw-bold d-block mt-1 ${esSeleccionado ? 'text-warning' : 'text-danger'}`} style={{fontSize: '0.7rem'}}>TEST USER</small>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* COLUMNA DERECHA */}
        <div className="col-8 h-100 p-4 d-flex flex-column">
          {pedidoSeleccionado ? (
            <>
              <div className="d-flex justify-content-between align-items-start mb-4">
                <div>
                    <h2 className="m-0">
                        {/* MOSTRAR EL NÚMERO DE PEDIDO AQUI TAMBIÉN */}
                        <span className="badge bg-dark fs-4 me-3">#{pedidoSeleccionado.numero_pedido}</span>
                        
                        {pedidoSeleccionado.nombre_cliente ? (
                           <span className="text-uppercase">{pedidoSeleccionado.nombre_cliente}</span>
                        ) : (
                           <span>Mesa {pedidoSeleccionado.mesa}</span>
                        )}

                        <span className="badge bg-warning text-dark ms-2 fs-6">{pedidoSeleccionado.tipo_entrega}</span>
                    </h2>
                    
                    {/* DETALLES EXTRA: HORA Y MESA (si hay nombre) */}
                    <div className="mt-2 text-muted fs-5">
                        {pedidoSeleccionado.hora_pedido && (
                            <span className="me-4"><i className="bi bi-clock"></i> <strong>{pedidoSeleccionado.hora_pedido}</strong></span>
                        )}
                        {pedidoSeleccionado.nombre_cliente && (
                            <span><i className="bi bi-layout-sidebar"></i> Mesa: {pedidoSeleccionado.mesa}</span>
                        )}
                    </div>
                </div>
                
                <div className="btn-group">
                  <button className="btn btn-outline-primary fw-bold" onClick={() => onEditar(pedidoSeleccionado)}>
                    <i className="bi bi-pencil"></i> Editar
                  </button>
                  
                  <button className="btn btn-outline-danger fw-bold" onClick={anularPedido}>
                    <i className="bi bi-trash3"></i> Anular
                  </button>

                  <button className="btn btn-secondary" onClick={() => setPedidoSeleccionado(null)}>
                    <i className="bi bi-x"></i> Cerrar
                  </button>
                </div>
              </div>

              <div className="card shadow-sm mb-4 flex-grow-1 overflow-auto">
                <div className="card-body p-0">
                  <table className="table table-striped mb-0">
                    <thead className="table-dark">
                      <tr><th>Cant</th><th>Producto</th><th className="text-end">Precio</th><th className="text-end">Subtotal</th></tr>
                    </thead>
                    <tbody>
                      {pedidoSeleccionado.items.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.cantidad}</td>
                          <td>
                              {item.nombre}
                              {item.observacion && <div className="small text-muted fst-italic"> {item.observacion}</div>}
                          </td>
                          <td className="text-end">{formatoPeso(item.precio)}</td><td className="text-end">{formatoPeso(item.precio * item.cantidad)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="d-flex justify-content-end align-items-center gap-4 border-top pt-3">
                <h1 className="text-success m-0">{formatoPeso(pedidoSeleccionado.total)}</h1>
                <button className="btn btn-success btn-lg px-5 py-3 fw-bold" onClick={abrirModalPago}><i className="bi bi-cash"></i> PAGAR Y CERRAR</button>
              </div>
            </>
          ) : (
            <div className="d-flex h-100 align-items-center justify-content-center text-muted flex-column">
              <span style={{fontSize: '4rem'}}><i className="bi bi-fork-knife"></i></span><h3>Selecciona una mesa para ver el detalle</h3>
              {esPrueba && <h5 className="text-danger mt-3">MODO PRUEBA ACTIVO</h5>}
            </div>
          )}
        </div>
      </div>

      {/* MODAL DE PAGO */}
      {mostrandoPago && pedidoSeleccionado && (
        <div className="modal d-block" style={{backgroundColor: 'rgba(0,0,0,0.5)'}}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content">
              <div className="modal-header bg-success text-white">
                <h5 className="modal-title fw-bold">Cerrar Mesa #{pedidoSeleccionado.numero_pedido}</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setMostrandoPago(false)}></button>
              </div>
              <div className="modal-body p-4">
                
                {/* SECCIÓN DE TOTALES Y DESCUENTOS */}
                <div className="d-flex justify-content-between align-items-start mb-4 bg-light p-3 rounded border">
                    <div className="d-flex flex-column gap-2">
                        <div className="text-muted fw-bold">Subtotal Original: {formatoPeso(totalOriginal)}</div>
                        <div className="d-flex align-items-center">
                            <label className="me-2 fw-bold text-dark">Descuento (%):</label>
                            <div className="input-group input-group-sm" style={{width: '100px'}}>
                                <input 
                                    type="text"
                                    className="form-control fw-bold text-center border-primary text-primary" 
                                    placeholder="0"
                                    value={descuento}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '' || /^[0-9\b]+$/.test(val)) {
                                            let numVal = parseInt(val) || 0;
                                            if (numVal > 100) numVal = 100;
                                            if (val === '') {
                                                setDescuento('');
                                            } else {
                                                setDescuento(numVal.toString()); 
                                            }
                                            setPagos({ efectivo: 0, debito: 0, transferencia: 0, edenred: 0 });
                                        }
                                    }}
                                />
                                <span className="input-group-text bg-primary text-white">%</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="text-end">
                        {descNum > 0 && (
                           <div className="mb-1">
                               <div className="text-danger fw-bold" style={{fontSize: '1.1rem'}}>
                                   - {formatoPeso(montoDescuento)}
                               </div>
                               <small className="text-muted d-block">(Descuento aplicado)</small>
                           </div>
                        )}
                        <div className="border-top mt-2 pt-2">
                            <div className="text-muted small text-uppercase fw-bold">Total a Pagar</div>
                            <h1 className="fw-bold text-success m-0" style={{fontSize: '2.5rem'}}>
                                {formatoPeso(totalPagar)}
                            </h1>
                        </div>
                    </div>
                </div>

                <div className="row g-2 mb-4">
                {['EFECTIVO', 'DEBITO', 'TRANSFERENCIA', 'EDENRED', 'MIXTO'].map((metodo) => {
                    const info = configMedios[metodo]; 
                    return (
                        <div className="col" key={metodo}>
                            <button
                                className={`btn w-100 py-3 fw-bold ${metodoPago === metodo ? 'btn-dark border-3 border-'+info.color : 'btn-outline-secondary'}`}
                                onClick={() => {
                                    setMetodoPago(metodo);
                                    if(metodo === 'MIXTO') setMediosMixtosActivos([]); 
                                }}
                            >
                                <i className={`bi ${info.icon} fs-3 d-block mb-1 text-${metodoPago === metodo ? 'white' : info.color}`}></i>
                                {metodo}
                            </button>
                        </div>
                    );
                })}
            </div>

                {metodoPago === 'MIXTO' ? (
                    <div className="p-3 bg-light rounded border">
                        <h6 className="mb-2 fw-bold text-primary">1. Selecciona los medios a combinar:</h6>
                        <div className="d-flex gap-2 mb-3 flex-wrap">
                            {listaMedios.map((m) => (
                                <button key={m.key} className={`btn btn-sm px-3 py-2 fw-bold ${mediosMixtosActivos.includes(m.key) ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => toggleMedioMixto(m.key)}>
                                    {mediosMixtosActivos.includes(m.key) ? <i className="bi bi-check-circle"></i> : ' '} {m.label}
                                </button>
                            ))}
                        </div>

                        {mediosMixtosActivos.length > 0 && (
                            <>
                                <h6 className="mb-2 fw-bold text-primary">2. Ingresa los montos:</h6>
                                <div className="row g-3">
                                    {mediosMixtosActivos.map(key => {
                                        const info = listaMedios.find(m => m.key === key);
                                        const mostrarBotonAyuda = mediosMixtosActivos.length > 2 && faltaPorCubrir > 0;

                                        return (
                                            <div className="col-6" key={key}>
                                                <div className="input-group">
                                                    <span className="input-group-text">{info.label}</span>
                                                    <input 
                                                        type="text" 
                                                        className="form-control fw-bold text-end" 
                                                        placeholder="0"
                                                        value={pagos[key] > 0 ? pagos[key].toLocaleString('es-CL') : ''} 
                                                        onClick={(e)=>e.target.select()} 
                                                        onChange={e => handleInputPagoMixto(key, e.target.value)}
                                                        onKeyDown={handleKeyDownInput}
                                                    />
                                                    {mostrarBotonAyuda && (
                                                        <button className="btn btn-outline-success" title="Completar resto aquí" onClick={() => completarRestante(key)}>⬅</button>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                                <div className="mt-3 d-flex justify-content-between align-items-center p-2 rounded bg-white border">
                                    <span className="text-muted">Falta por cubrir:</span>
                                    <span className={`fw-bold fs-5 ${faltaPorCubrir === 0 ? 'text-success' : 'text-danger'}`}>
                                        {formatoPeso(faltaPorCubrir)}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="alert alert-info text-center fw-bold">
                         <span className="badge bg-dark me-2">ENTER</span> para confirmar pago de {formatoPeso(totalPagar)} con {metodoPago}
                    </div>
                )}
              </div>
              <div className="modal-footer bg-light">
                <button type="button" className="btn btn-secondary btn-lg" onClick={() => setMostrandoPago(false)}>Cancelar</button>
                <button type="button" className="btn btn-success btn-lg fw-bold px-5" onClick={procesarPago}>CONFIRMAR PAGO</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};