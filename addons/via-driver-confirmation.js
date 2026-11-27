/* Render only the authorized driverProfile already delivered with a booking. */
(function(root){
 const active=new Set(['confirmed','en_route','arrived','in_progress']);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const photo=x=>typeof x==='string'&&x.length<=240000&&/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(x)?'data:image/jpeg;base64,'+x:'';
 function render(b){
  if(!active.has(b?.status))return '';
  const p=b.driverProfile;
  if(!p||p.reviewed!==true)return '<section class="via-driver-profile"><h3>Tu conductor y vehículo</h3><p>Te mostraremos los datos de identificación cuando estén disponibles.</p></section>';
  const face=photo(p.photos?.driver),front=photo(p.photos?.front),rear=photo(p.photos?.rear);
  if(!face||!front||!rear||!p.name||!p.plate)return '';
  return '<section class="via-driver-profile" aria-label="Conductor y vehículo asignados"><small>CONDUCTOR ASIGNADO</small><div class="via-driver-person"><img alt="Foto del conductor" src="'+face+'"><div><h3>'+esc(p.name)+'</h3><p>Perfil revisado por Vía Traslados</p></div></div><small>TU VEHÍCULO</small><div class="via-driver-car"><img alt="Vista frontal del vehículo" src="'+front+'"><img alt="Vista trasera del vehículo" src="'+rear+'"></div><h3>'+esc(p.make)+' '+esc(p.model)+'</h3><p>'+esc(p.color)+'</p><div class="via-driver-plate"><small>MATRÍCULA</small><strong>'+esc(p.plate.slice(0,3)+' '+p.plate.slice(3))+'</strong></div></section>';
 }
 root.ViaDriverConfirmation={render};
})(globalThis);
