import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp } from 'firebase/firestore';
import './css/bootstrap.min.css';

export const MesasActivas = ({ onEditar }) => {
  const [pedidos, setPedidos] = useState([]);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  
  const [mostrandoPago, setMostrandoPago] = useState(false);
  const [metodoPago, setMetodoPago] = useState('EFECTIVO'); 
  const [mediosMixtosActivos, setMediosMixtosActivos] = useState([]);

  // Estado para el descuento (ahora puede ser string vacío para facilitar edición)
  const [descuento, setDescuento] = useState(0); 

  const [pagos, setPagos] = useState({
    efectivo: 0, debito: 0, transferencia: 0, edenred: 0
  });

  // Diccionario de Iconos y Colores
    const configMedios = {
    'EFECTIVO':      { icon: 'bi-cash-stack', color: 'success' }, 
    'DEBITO':        { icon: 'bi-credit-card-2-front', color: 'primary' }, 
    'TRANSFERENCIA': { icon: 'bi-bank', color: 'info' }, 
    'EDENRED':       { icon: 'bi-ticket-perforated', color: 'warning' }, 
    'MIXTO':         { icon: 'bi-collection', color: 'secondary' } 
    };

  useEffect(() => {
    const q = query(collection(db, "ordenes"), where("estado", "==", "pendiente"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPedidos(lista.sort((a, b) => a.fecha - b.fecha));
    });
    return () => unsubscribe();
  }, []);

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
        const ordenRef = doc(db, "ordenes", pedidoSeleccionado.id);
        await updateDoc(ordenRef, {
            estado: "cancelado",
            fecha_cancelacion: Timestamp.now()
        });
        setPedidoSeleccionado(null);
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
      // Convertimos descuento a número para el cálculo, si es vacío lo tratamos como 0
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
      const ordenRef = doc(db, "ordenes", pedidoSeleccionado.id);
      // Aseguramos guardar el descuento como número
      const descFinal = parseInt(descuento) || 0;

      await updateDoc(ordenRef, {
        estado: "pagado",
        fecha_cierre: Timestamp.now(),
        metodo_pago: metodoPago,
        desglose_pago: datosPago,
        total_original: totalOriginal, 
        descuento_porcentaje: descFinal, 
        total_final: totalPagar 
      });
      
      setMostrandoPago(false);
      setPedidoSeleccionado(null);
      setPagos({ efectivo: 0, debito: 0, transferencia: 0, edenred: 0 });
      setMediosMixtosActivos([]);
      setDescuento(0);
    } catch (e) {
      console.error(e);
      alert("Error al cerrar mesa");
    }
  };

  // LISTENER GLOBAL PARA ENTER EN PAGOS SIMPLES
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
  
  // Valores calculados
  const totalOriginal = pedidoSeleccionado ? calcularTotalOriginal(pedidoSeleccionado.items) : 0;
  const descNum = parseInt(descuento) || 0;
  const montoDescuento = pedidoSeleccionado ? Math.round(totalOriginal * (descNum / 100)) : 0;
  const totalPagar = totalOriginal - montoDescuento;

  const totalActual = pagos.efectivo + pagos.debito + pagos.transferencia + pagos.edenred;
  const faltaPorCubrir = totalPagar - totalActual;

  // FUNCIÓN PARA ABRIR EL MODAL Y RESETEAR VALORES
  const abrirModalPago = () => {
      setDescuento(''); // Iniciar vacío para que se vea el placeholder o 0 limpio
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
          <div className="list-group list-group-flush">
            {pedidos.map(p => (
              <button key={p.id} className={`list-group-item list-group-item-action py-3 ${pedidoSeleccionado?.id === p.id ? 'active' : ''}`} onClick={() => setPedidoSeleccionado(p)}>
                <div className="d-flex w-100 justify-content-between">
                  <h5 className="mb-1">Mesa {p.numero_pedido || '?'} {p.tipo_entrega === 'REPARTO' && <i className="bi bi-car-front-fill"></i>} {p.tipo_entrega === 'LOCAL' && <i className="bi bi-shop-window fs-4 me-2"></i>}</h5>
                  <small>{p.fecha ? new Date(p.fecha.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}</small>
                </div>
                <p className="mb-1">{p.tipo_entrega}</p>
                <small className="fw-bold fs-6">{formatoPeso(p.total)}</small>
              </button>
            ))}
          </div>
        </div>

        {/* COLUMNA DERECHA */}
        <div className="col-8 h-100 p-4 d-flex flex-column">
          {pedidoSeleccionado ? (
            <>
              <div className="d-flex justify-content-between align-items-center mb-4">
                <h2 className="m-0">
                    Mesa {pedidoSeleccionado.mesa} 
                    <span className="badge bg-warning text-dark ms-2 fs-6">{pedidoSeleccionado.tipo_entrega}</span>
                </h2>
                
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
                              {item.observacion && <div className="small text-muted fst-italic">** {item.observacion}</div>}
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
                {/* Usamos abrirModalPago para resetear estados antes de abrir */}
                <button className="btn btn-success btn-lg px-5 py-3 fw-bold" onClick={abrirModalPago}><i className="bi bi-cash"></i> PAGAR Y CERRAR</button>
              </div>
            </>
          ) : (
            <div className="d-flex h-100 align-items-center justify-content-center text-muted flex-column">
              <span style={{fontSize: '4rem'}}><i className="bi bi-fork-knife"></i></span><h3>Selecciona una mesa para ver el detalle</h3>
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
                
                {/* SECCIÓN DE TOTALES Y DESCUENTOS (LAYOUT MEJORADO) */}
                <div className="d-flex justify-content-between align-items-start mb-4 bg-light p-3 rounded border">
                    
                    {/* COLUMNA IZQUIERDA: INPUT DE DESCUENTO */}
                    <div className="d-flex flex-column gap-2">
                        <div className="text-muted fw-bold">Subtotal Original: {formatoPeso(totalOriginal)}</div>
                        
                        <div className="d-flex align-items-center">
                            <label className="me-2 fw-bold text-dark">Descuento (%):</label>
                            <div className="input-group input-group-sm" style={{width: '100px'}}>
                                <input 
                                    type="text"  // Cambiado a texto para mejor control
                                    className="form-control fw-bold text-center border-primary text-primary" 
                                    placeholder="0"
                                    value={descuento}
                                    onChange={(e) => {
                                        // Permitir solo números y vacío
                                        const val = e.target.value;
                                        if (val === '' || /^[0-9\b]+$/.test(val)) {
                                            let numVal = parseInt(val) || 0;
                                            if (numVal > 100) numVal = 100;
                                            
                                            // Si es 0, mostramos vacío para que el usuario escriba cómodo
                                            if (val === '') {
                                                setDescuento('');
                                            } else {
                                                // Al escribir, parseInt elimina el 0 a la izquierda automáticamente
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
                    
                    {/* COLUMNA DERECHA: RESUMEN DE MONTOS */}
                    <div className="text-end">
                        {/* Mostrar monto descontado si hay descuento */}
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