# V36 — ficha de conductor y vehículo (QA)
Base Android: V35.12 producción, commit 3c84538515a6302d9a9d06bca67a6f532f5ac8ce. Variante aislada: uy.viatraslados.conductor.v36profileqa. No publicar como producción. Firebase no se activa.

Alcance: tres fotos, captura en tamaño completo, compresión JPEG, ML Kit incluido localmente, OCR de matrícula ordinaria uruguaya ABC1234, señales de detección preliminares, confirmación del conductor, ficha pendiente hasta revisión, recordatorios al ingresar y a los 30 min de uso, ficha privada en D1 y presentación solo al pasajero autorizado con reserva confirmada activa.

La revisión manual comprueba identidad y vehículo; ML Kit no identifica a una persona ni prueba propiedad del automóvil. Matrículas especiales fuera del formato se gestionarán en una ampliación. Una nueva revisión invalida la aprobación anterior. Si administración cambia el vehículo, las fotos previas no se muestran.

CI: SQL en memoria y datos ficticios, pruebas de permisos y presentación; APK QA solo compilación. NO desplegar la rama histórica como API productiva: la producción utiliza un bundle posterior con ajustes geográficos. Antes de despliegue, portar módulo a la fuente exacta del Worker vigente, verificar bindings QA y producción, migrar exclusivamente QA, proteger el acceso a las fotos (el QA público de personas sintéticas no es apto para fotos reales), verificar HTML/CSP/service worker de los assets activos, medir almacenamiento y revisar conservación y revocación. No usar fotos reales en QA. El APK QA aún no dispone de endpoint de ficha desplegado.
