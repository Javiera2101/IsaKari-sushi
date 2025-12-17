import React from 'react';
import './css/Ticket.css';
// IMPORTAMOS EL LOGO
import logoIsakari from './images/logoBK.png';

export const Ticket = ({ orden, total, numeroPedido, tipoEntrega, fecha, descripcion, logoUrl }) => {
  
  const formatoPeso = (valor) => {
    return valor.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });
  };

  // Usamos el logo que viene por props o el default importado
  const logoFinal = logoUrl || logoIsakari;

  return (
    <div className="ticket-container">
      
      <div className="text-center mb-2">
        {/* --- LOGO AÑADIDO --- */}
        <img 
            src={logoFinal} 
            alt="Logo IsaKari Sushi" 
            style={{ 
                maxWidth: '180px', 
                height: 'auto', 
                marginBottom: '5px',
                // filter: 'grayscale(100%) contrast(120%)' // Puedes descomentar si quieres forzar B/N
            }} 
        />
        {/* -------------------- */}

        <p className="m-0 fw-bold">Calle Comercio #1757</p> 
        <p className="m-0 mb-2 fw-bold">+56 9 813 51797</p>   
        
        <h3 className="fw-bold mt-2">Mesa {numeroPedido}</h3>
        
        <div className="linea-punteada"></div>
        <div className="d-flex justify-content-between fw-bold">
          <span>Fecha: {fecha}</span>
        </div>
      </div>

      <div className="items-section my-2">
        <div className="linea-punteada"></div>
        <div className="d-flex justify-content-between fw-bold mb-1">
            <span>CANTIDAD</span>
            <span>TOTAL</span>
        </div>
        <div className="linea-punteada"></div>
        
        {orden.map((item, i) => (
          <div key={i} className="mb-2" style={{ display: 'flex', flexDirection: 'column' }}>
            {/* FILA SUPERIOR: Nombre y Precio */}
            <div className="d-flex justify-content-between" style={{ alignItems: 'flex-start' }}>
                {/* IZQUIERDA: Cantidad, Nombre y Precio Unitario */}
                <div className="text-start" style={{ paddingRight: '5px', flex: 1 }}>
                  <span className="fw-bold d-block">
                    {item.cantidad} x {item.nombre}
                  </span>
                  
                  {/* DESCRIPCIÓN DEL PRODUCTO (Base de datos) */}
                  {item.descripcion_producto && (
                    <div style={{ fontSize: '0.8em', color: '#555', fontStyle: 'italic', lineHeight: '1.1', marginBottom: '2px' }}>
                        {item.descripcion_producto}
                    </div>
                  )}

                  {/* PRECIO UNITARIO */}
                  <small className="d-block text-muted" style={{ fontSize: '0.85em' }}>
                    {formatoPeso(item.precio)} c/u
                  </small>
                </div>

                {/* DERECHA: Precio Total del Item */}
                <div className="text-end" style={{ whiteSpace: 'nowrap', fontWeight: 'bold' }}>
                  {formatoPeso(item.precio * item.cantidad)}
                </div>
            </div>
            
            {/* FILA INFERIOR: Observación manual del ITEM */}
            {item.observacion && (
                <div className="text-start" style={{ fontSize: '0.95em', marginTop: '2px', fontWeight: 'bold', color: 'black' }}>
                    {item.observacion.toUpperCase()}
                </div>
            )}
          </div>
        ))}
    </div>

    {/* --- OBSERVACIONES GENERALES DEL PEDIDO (Restaurado) --- */}
    {descripcion && (
        <div className="my-2">
            <div className="linea-punteada"></div>
            <div className="fw-bold">Observación:</div>
            <div className="text-uppercase" style={{fontSize: '1em', fontWeight: 'bold'}}>{descripcion}</div>
        </div>
    )}
    {/* ------------------------------------------------------- */}

      <div className="linea-punteada"></div>
      <div className="d-flex justify-content-between fs-5 fw-bold my-2">
        <span>TOTAL</span>
        <span>{formatoPeso(total)}</span>
      </div>
      <div className="linea-punteada"></div>

      {tipoEntrega === 'REPARTO' && (
        <div className="datos-reparto mt-3 text-start">
          <h5 className="fw-bold text-center mb-3">DATOS DE DESPACHO</h5>
          <div className="campo-escribir mb-2"><strong>Pasaje/Calle:</strong></div>
          <div className="campo-escribir mb-2"><strong>Número:</strong></div>
          <div className="campo-escribir mb-2"><strong>Villa:</strong></div>
          <div className="campo-escribir mb-2"><strong>Fono:</strong></div>
          <div className="campo-escribir mb-2"><strong>Medio Pago: </strong></div>
          <div className="campo-escribir mb-2"><strong>Observación:</strong><div className="linea-punteada-doble"></div></div>
        </div>
      )}
    </div>
  );
};