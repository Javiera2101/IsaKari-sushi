import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase.js';
import { collection, query, where, getDocs, Timestamp, doc, updateDoc, addDoc, orderBy, limit } from 'firebase/firestore';
import { useReactToPrint } from 'react-to-print';
import './css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { ReporteCaja } from './ReporteCaja.jsx';
import { Ticket } from './Ticket.jsx';

// IMPORTACIÓN DE LOGOS
import logoIsakariPrint from './images/logoBK.png'; 
import logoIsakariColor from './images/logoColor.png'; 

// --- DICCIONARIOS DE ICONOS ---
const configMedios = {
  'EFECTIVO':      { icon: 'bi-cash-stack', color: 'success' },
  'DEBITO':        { icon: 'bi-credit-card-2-front', color: 'primary' },
  'TRANSFERENCIA': { icon: 'bi-bank', color: 'info' },
  'EDENRED':       { icon: 'bi-ticket-perforated', color: 'warning' },
  'MIXTO':         { icon: 'bi-collection', color: 'secondary' }
};

const listaMedios = [
    { key: 'efectivo', label: 'Efectivo', icon: 'bi-cash-stack', color: 'success' },
    { key: 'debito', label: 'Débito', icon: 'bi-credit-card-2-front', color: 'primary' },
    { key: 'transferencia', label: 'Transf.', icon: 'bi-bank', color: 'info' },
    { key: 'edenred', label: 'Junaeb', icon: 'bi-ticket-perforated', color: 'warning' }
];

const LOGO_URL = logoIsakariPrint;

// --- Funciones Helper ---
const isToday = (someDate) => {
    const today = new Date();
    return someDate.getDate() === today.getDate() &&
        someDate.getMonth() === today.getMonth() &&
        someDate.getFullYear() === today.getFullYear();
};

const formatDateForInput = (date) => {
    if (!date) return '';
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); 
    return d.toISOString().split('T')[0];
};

export const Caja = ({ user }) => { 
  const [ventasDia, setVentasDia] = useState([]);
  const [cargando, setCargando] = useState(true);
  
  const [cajaActiva, setCajaActiva] = useState(null); 
  const [fondoInicialInput, setFondoInicialInput] = useState(20000); 
  
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
  
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date());

  // Estado para forzar la vista de apertura de caja
  const [vistaApertura, setVistaApertura] = useState(false);

  const [editandoPago, setEditandoPago] = useState(false);
  const [tempMetodo, setTempMetodo] = useState('');
  const [tempPagos, setTempPagos] = useState({ efectivo: 0, debito: 0, transferencia: 0, edenred: 0 });
  const [tempMixtosActivos, setTempMixtosActivos] = useState([]);

  const [totales, setTotales] = useState({
    efectivo: 0, debito: 0, transferencia: 0, edenred: 0, 
    totalVentas: 0, totalLocal: 0, totalReparto: 0,
    totalAnulado: 0, cantAnulados: 0
  });

  const reportRef = useRef(null);
  const ticketRef = useRef(null); 

  const handlePrintReport = useReactToPrint({
    contentRef: reportRef,
    content: () => reportRef.current,
    documentTitle: `Cierre_Caja_${formatDateForInput(fechaSeleccionada)}`
  });

  const handleReprintTicket = useReactToPrint({
      contentRef: ticketRef,
      content: () => ticketRef.current,
      documentTitle: `Ticket_Reimpresion`
  });

  const formatoPeso = (valor) => valor.toLocaleString('es-CL', {style: 'currency', currency: 'CLP'});

  const handleFondoChange = (e) => {
      const rawValue = e.target.value.replace(/[^0-9]/g, '');
      const intValue = rawValue === '' ? 0 : parseInt(rawValue, 10);
      setFondoInicialInput(intValue);
  };

  // --- Lógica de Edición ---
  useEffect(() => {
    if (ventaSeleccionada) {
        setEditandoPago(false); 
        setTempMetodo(ventaSeleccionada.metodo_pago);
        if (ventaSeleccionada.desglose_pago) {
            setTempPagos(ventaSeleccionada.desglose_pago);
            const activos = Object.keys(ventaSeleccionada.desglose_pago).filter(k => ventaSeleccionada.desglose_pago[k] > 0);
            setTempMixtosActivos(activos);
        } else {
            setTempPagos({ efectivo: 0, debito: 0, transferencia: 0, edenred: 0 });
            setTempMixtosActivos([]);
        }
    }
  }, [ventaSeleccionada]);

  const handleInputEdit = (metodo, valorRaw) => {
      const valorLimpio = valorRaw.replace(/\./g, '').replace(/[^0-9]/g, '');
      const val = valorLimpio === '' ? 0 : parseInt(valorLimpio);
      let nuevos = { ...tempPagos, [metodo]: val };
      if (tempMixtosActivos.length === 2) {
          const otro = tempMixtosActivos.find(m => m !== metodo);
          const diff = ventaSeleccionada.total_final - val;
          nuevos[otro] = Math.max(0, diff);
      }
      setTempPagos(nuevos);
  };

  const toggleMixtoEdit = (metodo) => {
      if (tempMixtosActivos.includes(metodo)) {
          setTempMixtosActivos(tempMixtosActivos.filter(m => m !== metodo));
          setTempPagos({...tempPagos, [metodo]: 0});
      } else {
          setTempMixtosActivos([...tempMixtosActivos, metodo]);
      }
  };
  
  const completarRestante = (metodoDestino) => {
    let sumaOtros = 0;
    Object.keys(tempPagos).forEach(key => {
        if (key !== metodoDestino && tempMixtosActivos.includes(key)) {
            sumaOtros += tempPagos[key];
        }
    });
    setTempPagos({ ...tempPagos, [metodoDestino]: Math.max(0, ventaSeleccionada.total_final - sumaOtros) });
  };

  const guardarCambioPago = async () => {
      const totalIngresado = tempPagos.efectivo + tempPagos.debito + tempPagos.transferencia + tempPagos.edenred;
      if (tempMetodo === 'MIXTO' && totalIngresado !== ventaSeleccionada.total_final) {
          return alert(`Error: Los montos no suman el total de la venta (${formatoPeso(ventaSeleccionada.total_final)})`);
      }
      let datosPago = {};
      let metodoFinal = tempMetodo;

      if (tempMetodo === 'MIXTO') {
          datosPago = Object.fromEntries(
              Object.entries(tempPagos).filter(([, v]) => v > 0)
          );
          if (Object.keys(datosPago).length === 1) {
             metodoFinal = Object.keys(datosPago)[0].toUpperCase();
             datosPago = null; 
          }
      } else {
          datosPago = null; 
      }

      try {
          const ref = doc(db, "ordenes", ventaSeleccionada.id);
          await updateDoc(ref, {
              metodo_pago: metodoFinal,
              desglose_pago: datosPago
          });
          alert("✅ Medio de pago actualizado correctamente. Recargando datos...");
          setVentaSeleccionada(null);
          await cargarDatosDelDia();
      } catch (e) {
          console.error(e);
          alert("Error al actualizar pago");
      }
  };

  // --- CÁLCULOS ---
  const calcularTotales = (ventas) => {
    let acumulador = { 
        efectivo: 0, debito: 0, transferencia: 0, edenred: 0, 
        totalVentas: 0, totalLocal: 0, totalReparto: 0,
        totalAnulado: 0, cantAnulados: 0
    };
    ventas.forEach(venta => {
        if (venta.estado === 'cancelado') {
            acumulador.totalAnulado += (venta.total_final || venta.total || 0);
            acumulador.cantAnulados += 1;
            return;
        }
        const monto = venta.total_final || 0;
        acumulador.totalVentas += monto;
        if (venta.tipo_entrega === 'REPARTO') {
            acumulador.totalReparto += monto;
        } else {
            acumulador.totalLocal += monto;
        }
        if (venta.desglose_pago) {
            acumulador.efectivo += venta.desglose_pago.efectivo || 0;
            acumulador.debito += venta.desglose_pago.debito || 0;
            acumulador.transferencia += venta.desglose_pago.transferencia || 0;
            acumulador.edenred += venta.desglose_pago.edenred || 0;
        } else if (venta.metodo_pago) {
            const metodo = venta.metodo_pago.toLowerCase();
            if (acumulador[metodo] !== undefined) acumulador[metodo] += monto;
        }
    });
    setTotales(acumulador);
  };

  // --- LÓGICA DEL TURNO (CAJA) ---
  const cargarDatosDelDia = async () => {
    setCargando(true);

    let inicioDia = new Date(fechaSeleccionada);
    inicioDia.setHours(0, 0, 0, 0);
    let finDia = new Date(inicioDia);
    finDia.setDate(finDia.getDate() + 1);

    const inicioDiaTS = Timestamp.fromDate(inicioDia);
    const finDiaTS = Timestamp.fromDate(finDia);

    try {
        let cajaEncontrada = null;
        
        if (isToday(fechaSeleccionada)) {
            const qAbierta = query(
                collection(db, "cajas"),
                where("estado", "==", "abierta"),
                limit(1)
            );
            const snapshotAbierta = await getDocs(qAbierta);
            if (!snapshotAbierta.empty) {
                cajaEncontrada = { id: snapshotAbierta.docs[0].id, ...snapshotAbierta.docs[0].data() };
                setVistaApertura(false);
            }
        }

        if (!cajaEncontrada) {
            const qCerrada = query(
                collection(db, "cajas"),
                where("fecha_apertura", ">=", inicioDiaTS),
                where("fecha_apertura", "<", finDiaTS),
                orderBy("fecha_apertura", "desc"), 
                limit(1)
            );
            const snapshotCerrada = await getDocs(qCerrada);
             if (!snapshotCerrada.empty) {
                cajaEncontrada = { id: snapshotCerrada.docs[0].id, ...snapshotCerrada.docs[0].data() };
            }
        }

        setCajaActiva(cajaEncontrada);
        if (cajaEncontrada) {
            setFondoInicialInput(cajaEncontrada.fondo_inicial);
        }

        // --- CORRECCIÓN DE LÓGICA PARA NO MOSTRAR ORDENES "HUERFANAS" ---
        // Si no encontramos caja para una fecha pasada, no cargamos ventas.
        if (!cajaEncontrada && !isToday(fechaSeleccionada)) {
            setVentasDia([]);
            setTotales({
                efectivo: 0, debito: 0, transferencia: 0, edenred: 0, 
                totalVentas: 0, totalLocal: 0, totalReparto: 0,
                totalAnulado: 0, cantAnulados: 0
            });
            setCargando(false);
            return;
        }
        // -------------------------------------------------------------------

        let inicioVentas = inicioDiaTS;
        let finVentas = finDiaTS;

        if (cajaEncontrada) {
            inicioVentas = cajaEncontrada.fecha_apertura;
            if (cajaEncontrada.fecha_cierre) {
                finVentas = cajaEncontrada.fecha_cierre;
            } else {
                finVentas = Timestamp.now(); 
            }
        }

        const qVentas = query(
            collection(db, "ordenes"),
            where("fecha", ">=", inicioVentas),
            where("fecha", "<", finVentas),
            where("estado", "in", ["pagado", "cancelado"])
        );

        const ventasSnapshot = await getDocs(qVentas); 
        const listaVentas = ventasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        listaVentas.sort((a, b) => {
            const fA = a.fecha_cierre || a.fecha_cancelacion || a.fecha;
            const fB = b.fecha_cierre || b.fecha_cancelacion || b.fecha;
            return fB - fA;
        });
        
        setVentasDia(listaVentas);
        calcularTotales(listaVentas);

    } catch (error) {
        console.error("Error cargando caja:", error);
    } finally {
        setCargando(false);
    }
  };

  const iniciarCaja = async () => {
    if (fondoInicialInput < 0) return alert("El fondo inicial no puede ser negativo");
    
    if (!user || !user.uid) { 
        return alert("Error: No se pudo obtener el ID de usuario. Por favor, inicia sesión.");
    }
    
    try {
        await addDoc(collection(db, "cajas"), {
            fondo_inicial: fondoInicialInput,
            fecha_apertura: Timestamp.now(),
            estado: "abierta",
            id_usuario: user.uid,
            email_usuario: user.email 
        });
        alert(`✅ Caja iniciada con ${formatoPeso(fondoInicialInput)} por ${user.email}`);
        setVistaApertura(false); 
        await cargarDatosDelDia();
    } catch (e) {
        console.error(e);
        alert("Error al iniciar caja");
    }
  };

  const cerrarCaja = async () => {
    if (!cajaActiva) return alert("No hay caja abierta para cerrar");

    try {
        const qPendientes = query(collection(db, "ordenes"), where("estado", "==", "pendiente"));
        const snapshotPendientes = await getDocs(qPendientes);

        if (!snapshotPendientes.empty) {
            return alert(`⛔ NO SE PUEDE CERRAR CAJA.\n\nAún hay ${snapshotPendientes.size} mesas/pedidos activos. Debes cobrarlos o anularlos antes de cerrar el turno.`);
        }
    } catch (error) {
        console.error("Error verificando mesas activas:", error);
        return alert("Error al verificar mesas activas. Intente nuevamente.");
    }

    const confirmacion = window.confirm(
        `⛔ ¿Estás seguro de CERRAR el turno?\n\nLa Venta Total es: ${formatoPeso(totales.totalVentas)}\nFondo en Efectivo: ${formatoPeso(totales.efectivo + cajaActiva.fondo_inicial)}`
    );

    if (confirmacion) {
        try {
            const ref = doc(db, "cajas", cajaActiva.id);
            await updateDoc(ref, {
                estado: "cerrada",
                fecha_cierre: Timestamp.now(),
                fondo_final: totales.efectivo + cajaActiva.fondo_inicial,
                totales: totales
            });
            alert("✅ Turno cerrado correctamente");
            setCajaActiva(null);
            setVentasDia([]);
            setTotales({
                efectivo: 0, debito: 0, transferencia: 0, edenred: 0, 
                totalVentas: 0, totalLocal: 0, totalReparto: 0,
                totalAnulado: 0, cantAnulados: 0
            });
            await cargarDatosDelDia(); 
        } catch (e) {
            console.error(e);
            alert("Error al cerrar caja");
        }
    }
  };

  useEffect(() => {
    cargarDatosDelDia();
  }, [fechaSeleccionada, user]);

  const handleDateChange = (dateString) => {
      if (!dateString) { setFechaSeleccionada(new Date()); return; }
      const parts = dateString.split('-');
      const newDate = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0); 
      setFechaSeleccionada(newDate);
      setVistaApertura(false); 
  };
  
  const fondoCajaDisplay = cajaActiva ? cajaActiva.fondo_inicial : fondoInicialInput;
  const totalEfectivoCalculado = totales.efectivo + fondoCajaDisplay;

  // --- RENDERIZADO ---
  if (!cargando && isToday(fechaSeleccionada) && (!cajaActiva || vistaApertura)) {
      return (
          <div className="container-fluid h-100 bg-light p-5 d-flex justify-content-center align-items-center">
              <div className="card shadow-lg p-5 text-center" style={{maxWidth: '400px'}}>
                  
                  {/* --- LOGO COLOR --- */}
                  <img 
                      src={logoIsakariColor} 
                      alt="Iniciar Turno" 
                      className="img-fluid mb-3 rounded"
                      style={{maxHeight: '150px', objectFit: 'contain'}}
                  />
                  
                  <h2 className="mb-4 fw-bold">Iniciar Nuevo Turno</h2>
                  
                  {cajaActiva && (
                      <div className="alert alert-info small mb-3">
                          Ya existe un turno cerrado hoy. Al iniciar uno nuevo, el folio de pedidos se reiniciará.
                      </div>
                  )}

                  <h5 className="text-muted">Fondo inicial:</h5>
                  
                  {/* --- INPUT FORMATEADO CON PESOS Y EVENTO ENTER --- */}
                  <div className="input-group mb-4">
                      <span className="input-group-text fw-bold">$</span>
                      <input 
                          type="text" 
                          className="form-control form-control-lg text-center fw-bold" 
                          value={fondoInicialInput.toLocaleString('es-CL')} 
                          onChange={handleFondoChange}
                          onKeyDown={(e) => { if (e.key === 'Enter') iniciarCaja() }}
                      />
                  </div>

                  <button className="btn btn-primary btn-lg fw-bold w-100" onClick={iniciarCaja} disabled={!user}>
                      <i className="bi bi-play-fill me-2"></i> INICIAR TURNO
                  </button>
                  {!user && <p className="text-danger mt-2 small">Debes iniciar sesión para abrir la caja.</p>}
                  
                  {vistaApertura && cajaActiva && (
                      <button className="btn btn-link mt-3" onClick={() => setVistaApertura(false)}>
                          Cancelar y ver turno anterior
                      </button>
                  )}
              </div>
          </div>
      );
  }

  if (!cargando && !cajaActiva && !isToday(fechaSeleccionada) && ventasDia.length === 0) {
      return (
          <div className="container-fluid h-100 bg-light p-5 text-center">
              <h2 className="fw-bold text-dark"><i className="bi bi-bar-chart me-2"></i>Cierre de Caja</h2>
              <div className="d-flex align-items-center justify-content-center gap-2 mt-2 mb-5">
                  <h5 className="text-muted m-0">Fecha:</h5>
                  <input 
                      type="date"
                      className="form-control form-control-lg fw-bold"
                      style={{maxWidth: '220px'}}
                      value={formatDateForInput(fechaSeleccionada)}
                      onChange={(e) => handleDateChange(e.target.value)}
                  />
              </div>
              <div className="alert alert-secondary mt-5" role="alert">
                <i className="bi bi-info-circle-fill me-2"></i> No se encontraron movimientos ni caja activa para este turno.
              </div>
          </div>
      );
  }


  return (
    <div className="container-fluid h-100 bg-light p-4 overflow-auto">
      
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h2 className="fw-bold text-dark"><i className="bi bi-bar-chart me-2"></i>Cierre de Caja</h2>
            <div className="d-flex align-items-center gap-2 mt-2">
                <h5 className="text-muted m-0">Fecha:</h5>
                <input 
                    type="date"
                    className="form-control form-control-lg fw-bold"
                    style={{maxWidth: '220px'}}
                    value={formatDateForInput(fechaSeleccionada)}
                    onChange={(e) => handleDateChange(e.target.value)}
                />
            </div>
            {cajaActiva && cajaActiva.estado === 'abierta' && (
                <span className="badge bg-success mt-2 fs-6">
                    <i className="bi bi-check-circle-fill me-2"></i> CAJA ABIERTA
                </span>
            )}
            {cajaActiva && cajaActiva.estado === 'cerrada' && (
                 <div className="d-flex gap-2 align-items-center mt-2">
                    <span className="badge bg-secondary fs-6">
                        <i className="bi bi-archive-fill me-2"></i> TURNO CERRADO
                    </span>
                    {isToday(fechaSeleccionada) && (
                        <button className="btn btn-sm btn-outline-primary fw-bold" onClick={() => setVistaApertura(true)}>
                            <i className="bi bi-plus-circle me-1"></i> Abrir Nuevo Turno
                        </button>
                    )}
                 </div>
            )}
            {cajaActiva && cajaActiva.email_usuario && (
                <span className="text-muted small d-block mt-1">
                    Abierta por: {cajaActiva.email_usuario}
                </span>
            )}
        </div>
        
        <div className="d-flex gap-3">
            {cajaActiva && cajaActiva.estado === 'abierta' && (
                <button className="btn btn-danger btn-lg shadow" onClick={cerrarCaja}>
                    <i className="bi bi-lock-fill me-2"></i>CERRAR TURNO
                </button>
            )}
            <button className="btn btn-dark btn-lg shadow" onClick={handlePrintReport}>
                <i className="bi bi-printer me-2"></i>IMPRIMIR CIERRE
            </button>
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-md-4">
            <div className="card bg-primary text-white h-100 shadow-sm">
                <div className="card-body">
                    <div className="text-center mb-3">
                        <h6 className="opacity-75">VENTA TOTAL</h6>
                        <h2 className="fw-bold display-6">{formatoPeso(totales.totalVentas)}</h2>
                    </div>
                </div>
            </div>
        </div>
        <div className="col-md-4">
            <div className="card bg-success text-white h-100 shadow-sm">
                <div className="card-body text-center">
                    <h6 className="opacity-75">EFECTIVO A RENDIR</h6>
                    <h2 className="fw-bold display-6">{formatoPeso(totalEfectivoCalculado)}</h2>
                    <small>Ventas: {formatoPeso(totales.efectivo)} + Caja inicial: {formatoPeso(fondoCajaDisplay)}</small>
                </div>
            </div>
        </div>
        <div className="col-md-4">
            <div className="card h-100 shadow-sm">
                <div className="card-body">
                    <div className="d-flex justify-content-between">
                        <span><i className="bi bi-credit-card-2-front text-primary me-2"></i>Transbank:</span>
                        <span className="fw-bold">{formatoPeso(totales.debito)}</span>
                    </div>
                    <div className="d-flex justify-content-between">
                        <span><i className="bi bi-bank text-info me-2"></i>Transferencias:</span>
                        <span className="fw-bold">{formatoPeso(totales.transferencia)}</span>
                    </div>
                    <div className="d-flex justify-content-between">
                        <span><i className="bi bi-ticket-perforated text-warning me-2"></i>Edenred:</span>
                        <span className="fw-bold">{formatoPeso(totales.edenred)}</span>
                    </div>
                </div>
            </div>
        </div>
      </div>

      <div className="card mb-4 shadow-sm border-0">
          <div className="card-body d-flex align-items-center gap-3">
              <h5 className="m-0">
                <i className="bi bi-cash-stack text-success me-2"></i>
                Fondo Inicial del Turno:
              </h5>
              {cajaActiva ? (
                  <span className="fw-bold fs-5 text-dark">{formatoPeso(cajaActiva.fondo_inicial)}</span>
              ) : (
                   <span className="fw-bold fs-5 text-dark">N/A</span>
              )}
          </div>
      </div>

      <div className="card shadow-sm border-0">
          <div className="card-body p-0">
              <table className="table table-hover mb-0 align-middle">
                  <thead className="table-light">
                      <tr>
                          <th>Hora</th><th>N°</th><th>Tipo</th><th className="text-end">Total</th><th className="text-center">Estado</th><th className="text-center">Detalle</th>
                      </tr>
                  </thead>
                  <tbody>
                      {cargando ? (
                          <tr><td colSpan="6" className="text-center py-5">Cargando datos...</td></tr>
                      ) : (
                          ventasDia.length === 0 ? (
                              <tr><td colSpan="6" className="text-center py-5 text-muted">No se encontraron movimientos.</td></tr>
                          ) : (
                              ventasDia.map(v => (
                                <tr key={v.id} className={v.estado === 'cancelado' ? 'table-danger' : ''}>
                                    <td>{v.fecha_cierre ? new Date(v.fecha_cierre.seconds * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                                    <td><span className="badge bg-dark">#{v.numero_pedido}</span></td>
                                    <td>
                                        {/* --- MODIFICACIÓN: SOLO 'LOCAL' --- */}
                                        {v.tipo_entrega === 'REPARTO' 
                                            ? <span className={`badge ${v.estado==='cancelado'?'bg-danger':'bg-warning text-dark'}`}><i className="bi bi-car-front-fill me-1"></i>REPARTO</span> 
                                            : <span className={`badge ${v.estado==='cancelado'?'bg-danger':'bg-primary'}`}><i className="bi bi-shop-window me-1"></i>LOCAL {v.mesa && v.mesa !== 'Local' ? `- ${v.mesa}` : ''}</span>
                                        }
                                    </td>
                                    <td className={`text-end fw-bold ${v.estado === 'cancelado' ? 'text-decoration-line-through' : 'text-success'}`}>{formatoPeso(v.total_final || v.total)}</td>
                                    <td className="text-center">
                                        {v.estado === 'cancelado' 
                                            ? <span className="badge bg-danger"><i className="bi bi-x-circle me-1"></i>ANULADO</span>
                                            : (v.metodo_pago === 'MIXTO' ? <span className="badge bg-secondary"><i className="bi bi-collection me-1"></i>Mixto</span> : <span className="badge bg-light text-dark border">{v.metodo_pago}</span>)
                                        }
                                    </td>
                                    <td className="text-center">
                                        <button className="btn btn-sm btn-outline-dark" onClick={() => setVentaSeleccionada(v)} title="Ver Detalle">
                                            <i className="bi bi-eye-fill"></i>
                                        </button>
                                    </td>
                                </tr>
                              ))
                          )
                      )}
                  </tbody>
              </table>
          </div>
      </div>

      {/* MODAL DE DETALLE Y EDICIÓN */}
      {ventaSeleccionada && (
        <div className="modal d-block" style={{backgroundColor: 'rgba(0,0,0,0.5)'}}>
          <div className={`modal-dialog modal-dialog-centered ${editandoPago ? 'modal-lg' : ''}`}>
            <div className="modal-content">
              <div className={`modal-header text-white ${ventaSeleccionada.estado === 'cancelado' ? 'bg-danger' : 'bg-dark'}`}>
                <h5 className="modal-title">{ventaSeleccionada.estado === 'cancelado' ? <><i className="bi bi-x-circle-fill me-2"></i>PEDIDO ANULADO</> : <><i className="bi bi-receipt me-2"></i>Orden #{ventaSeleccionada.numero_pedido}</>}</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setVentaSeleccionada(null)}></button>
              </div>
              
              <div className="modal-body">
                {!editandoPago && (
                    <>
                        <h5 className="mb-3 text-center">
                            {ventaSeleccionada.tipo_entrega === 'REPARTO' 
                                ? <><i className="bi bi-car-front-fill me-2"></i>Reparto</> 
                                : <><i className="bi bi-shop-window me-2"></i>Mesa {ventaSeleccionada.mesa}</>
                            }
                        </h5>

                        {/* --- LISTA DE PRODUCTOS CON OBSERVACIONES --- */}
                        <div className="card mb-3">
                            <ul className="list-group list-group-flush">
                                {ventaSeleccionada.items.map((item, i) => (
                                    <li key={i} className="list-group-item">
                                        <div className="d-flex justify-content-between">
                                            <span>{item.cantidad} x {item.nombre}</span>
                                            <strong>{formatoPeso(item.precio * item.cantidad)}</strong>
                                        </div>
                                        {/* MOSTRAR NOTA DEL PRODUCTO SI EXISTE */}
                                        {item.observacion && (
                                            <small className="text-muted d-block fst-italic ms-2">** {item.observacion}</small>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        
                        {/* --- OBSERVACIÓN GENERAL (NUEVO) --- */}
                        {ventaSeleccionada.descripcion && (
                            <div className="alert alert-warning mb-3">
                                <i className="bi bi-exclamation-circle-fill me-2"></i>
                                <strong>Nota del Pedido:</strong> {ventaSeleccionada.descripcion}
                            </div>
                        )}

                        {ventaSeleccionada.estado === 'pagado' && (
                            <div className="bg-light p-3 rounded border">
                                
                                {/* --- VISUALIZACIÓN DEL TOTAL CON DESCUENTO --- */}
                                {ventaSeleccionada.descuento_porcentaje > 0 ? (
                                    <div className="mb-3">
                                        <div className="d-flex justify-content-between text-muted">
                                            <span>Subtotal:</span>
                                            <span>{formatoPeso(ventaSeleccionada.total_original || ventaSeleccionada.total)}</span>
                                        </div>
                                        <div className="d-flex justify-content-between text-danger">
                                            <span>Descuento ({ventaSeleccionada.descuento_porcentaje}%):</span>
                                            <span>- {formatoPeso((ventaSeleccionada.total_original || ventaSeleccionada.total) - ventaSeleccionada.total_final)}</span>
                                        </div>
                                        <hr className="my-2"/>
                                        <div className="d-flex justify-content-between mb-2">
                                            <span className="fw-bold fs-5">TOTAL FINAL:</span>
                                            <span className="fw-bold fs-5 text-success">{formatoPeso(ventaSeleccionada.total_final)}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="d-flex justify-content-between mb-2">
                                        <span className="fw-bold">TOTAL:</span>
                                        <span className="fw-bold fs-5 text-success">{formatoPeso(ventaSeleccionada.total_final || ventaSeleccionada.total)}</span>
                                    </div>
                                )}
                                {/* ---------------------------------------------- */}
                                
                                <hr className="my-2"/>
                                
                                {ventaSeleccionada.metodo_pago === 'MIXTO' && ventaSeleccionada.desglose_pago ? (
                                    <>
                                        <div className="d-flex justify-content-between align-items-center mb-2">
                                            <span className="text-muted">Método:</span>
                                            <span className="badge bg-secondary fs-6">MIXTO</span>
                                        </div>
                                        <hr className="my-2"/>
                                        <span className="text-muted d-block mb-2 fw-semibold">Desglose de Pagos:</span>
                                        {Object.entries(ventaSeleccionada.desglose_pago)
                                            .filter(([, valor]) => valor > 0)
                                            .map(([metodo, valor]) => {
                                                const info = listaMedios.find(m => m.key === metodo);
                                                return (
                                                    <div key={metodo} className="d-flex justify-content-between align-items-center small py-1">
                                                        <span className="fw-semibold text-capitalize">
                                                            <i className={`bi ${info.icon} me-2 text-${info.color}`}></i>
                                                            {info.label}
                                                        </span>
                                                        <span className="fw-bold text-dark">{formatoPeso(valor)}</span>
                                                    </div>
                                                );
                                            })
                                        }
                                    </>
                                ) : (
                                    <div className="d-flex justify-content-between align-items-center mb-2">
                                        <span className="text-muted">Método:</span>
                                        <span className="badge bg-dark fs-6">{ventaSeleccionada.metodo_pago}</span>
                                    </div>
                                )}
                                
                                {/* --- BOTONES DE ACCIÓN --- */}
                                <div className="d-flex gap-2 mt-3">
                                    <button className="btn btn-secondary flex-fill" onClick={handleReprintTicket}>
                                        <i className="bi bi-printer me-2"></i>Reimprimir
                                    </button>

                                    {cajaActiva && cajaActiva.estado === 'abierta' && ( 
                                        <button className="btn btn-outline-primary flex-fill" onClick={() => setEditandoPago(true)}>
                                            <i className="bi bi-pencil-fill me-2"></i>Corregir Pago
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                        {ventaSeleccionada.estado === 'cancelado' && (
                            <div className="alert alert-danger text-center fw-bold">ANULADO</div>
                        )}
                    </>
                )}

                {editandoPago && (
                    <div className="animation-fade-in">
                         <h2 className="text-center mb-4 fw-bold text-success">Total: {formatoPeso(ventaSeleccionada.total_final)}</h2>
                         {/* ... (El resto del bloque de edición de pago se mantiene igual) ... */}
                         {/* Se omite por brevedad ya que no cambia la lógica de edición en este paso, solo visualización */}
                         <div className="row g-2 mb-4">
                            {['EFECTIVO', 'DEBITO', 'TRANSFERENCIA', 'EDENRED', 'MIXTO'].map((metodo) => {
                                const info = configMedios[metodo];
                                return (
                                <div className="col" key={metodo}>
                                    <button 
                                        className={`btn w-100 py-3 fw-bold ${tempMetodo === metodo ? 'btn-dark border-3 border-'+info.color : 'btn-outline-secondary'}`} 
                                        onClick={() => {setTempMetodo(metodo); if(metodo === 'MIXTO') setTempMixtosActivos([]);}}
                                    >
                                        <i className={`bi ${info.icon} fs-3 d-block mb-1 text-${tempMetodo === metodo ? 'white' : info.color}`}></i>
                                        {metodo}
                                    </button>
                                </div>
                            )})}
                        </div>
                        
                         {tempMetodo === 'MIXTO' && (
                            <div className="p-3 bg-light rounded border">
                                {/* ... Lógica de pago mixto ... */}
                                <h6 className="mb-2 fw-bold text-primary">1. Selecciona Medios:</h6>
                                <div className="d-flex gap-2 mb-3 flex-wrap">
                                    {listaMedios.map((m) => (
                                        <button key={m.key} className={`btn btn-sm px-3 py-2 fw-bold ${tempMixtosActivos.includes(m.key) ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => toggleMixtoEdit(m.key)}>
                                            {tempMixtosActivos.includes(m.key) ? <i className="bi bi-check-square-fill me-2"></i> : <i className="bi bi-square me-2"></i>} {m.label}
                                        </button>
                                    ))}
                                </div>
                                {tempMixtosActivos.length > 0 && (
                                    <div className="row g-3">
                                        {tempMixtosActivos.map(key => {
                                            // ... (Inputs de pago mixto) ...
                                            const info = listaMedios.find(m => m.key === key);
                                            const totalActual = tempPagos.efectivo + tempPagos.debito + tempPagos.transferencia + tempPagos.edenred;
                                            const falta = ventaSeleccionada.total_final - totalActual;
                                            const mostrarAyuda = tempMixtosActivos.length > 2 && falta > 0;
                                            return (
                                                <div className="col-6" key={key}>
                                                    <div className="input-group">
                                                        <span className="input-group-text"><i className={`bi ${info.icon} text-${info.color}`}></i></span>
                                                        <input type="text" className="form-control fw-bold text-end" 
                                                            value={tempPagos[key] > 0 ? tempPagos[key].toLocaleString('es-CL') : ''} 
                                                            onClick={(e)=>e.target.select()} 
                                                            onChange={e => handleInputEdit(key, e.target.value)}
                                                        />
                                                        {mostrarAyuda && <button className="btn btn-outline-success" onClick={() => completarRestante(key)}><i className="bi bi-arrow-left-short"></i></button>}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                                <div className="mt-3 text-end text-muted small">
                                    Faltan: {formatoPeso(ventaSeleccionada.total_final - (tempPagos.efectivo+tempPagos.debito+tempPagos.transferencia+tempPagos.edenred))}
                                </div>
                            </div>
                        )}

                        <div className="d-flex gap-2 mt-4">
                            <button className="btn btn-secondary btn-lg flex-fill" onClick={() => setEditandoPago(false)}><i className="bi bi-x-lg me-2"></i>Cancelar</button>
                            <button className="btn btn-success btn-lg flex-fill fw-bold" onClick={guardarCambioPago}><i className="bi bi-floppy me-2"></i>GUARDAR</button>
                        </div>
                    </div>
                )}
              </div>

              {!editandoPago && (
                  <div className="modal-footer">
                    <button className="btn btn-secondary w-100" onClick={() => setVentaSeleccionada(null)}>Cerrar Detalle</button>
                  </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* REPORTE OCULTO */}
      <div style={{ height: 0, overflow: 'hidden' }}>
          <div ref={reportRef}>
            <ReporteCaja 
              totales={totales} 
              fondoCaja={fondoCajaDisplay} 
              ventasCount={ventasDia.filter(v => v.estado === 'pagado').length} 
            />
          </div>
          {/* TICKET OCULTO PARA REIMPRESIÓN MODAL */}
          {ventaSeleccionada && (
              <div ref={ticketRef}>
                  <Ticket 
                      orden={ventaSeleccionada.items}
                      total={ventaSeleccionada.total_final || ventaSeleccionada.total}
                      numeroPedido={ventaSeleccionada.numero_pedido}
                      tipoEntrega={ventaSeleccionada.tipo_entrega}
                      // IMPORTANTE: Usamos el LOGO_URL importado
                      logoUrl={LOGO_URL} 
                      fecha={ventaSeleccionada.fecha ? new Date(ventaSeleccionada.fecha.seconds * 1000).toLocaleDateString('es-CL') + ' ' + new Date(ventaSeleccionada.fecha.seconds * 1000).toLocaleTimeString('es-CL', {hour: '2-digit', minute:'2-digit'}) : ''}
                      descripcion={ventaSeleccionada.descripcion}
                  />
              </div>
          )}
      </div>

    </div>
  );
};