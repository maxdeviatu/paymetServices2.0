<script>
document.addEventListener("DOMContentLoaded", () => {
    // 1. Seleccionar todos los contenedores del formulario por clase
    const paymentFormContainers = document.querySelectorAll(".paymentformepayco.w-form");
    
    paymentFormContainers.forEach(container => {
        // Eliminar la clase 'w-form' para evitar el comportamiento nativo
        container.classList.remove("w-form");

        // 2. Seleccionar los elementos necesarios dentro del contenedor
        const paymentForm = container.querySelector("form.containerform");
        const donePayment = container.querySelector(".success-message");
        const errorOnPayment = container.querySelector(".error-message");
        const payButton = container.querySelector(".paynowbtn");
        
        // 3. Función para sanitizar la entrada
        const sanitizeInput = (input) => {
            let sanitized = input.trim();
            sanitized = sanitized.replace(/[^a-zA-Z0-9@.\-\_\s]/g, '');
            return sanitized;
        };

        let formData = {};

        if (paymentForm) {
            paymentForm.addEventListener("submit", (event) => {
                event.preventDefault(); // Evita el envío natural del formulario

                // Obtener los valores de los campos dentro del mismo formulario
                let fullName = sanitizeInput(paymentForm.querySelector("#ePaycofullName-2").value);
                let documentType = sanitizeInput(paymentForm.querySelector("#ePaycodocumentType-2").value);
                let documentValue = sanitizeInput(paymentForm.querySelector("#documentePayco").value);
                let cellPhone = sanitizeInput(paymentForm.querySelector("#cellphoneePayco").value);
                let email = sanitizeInput(paymentForm.querySelector("#ePaycoEmail-2").value);

                // Validar los campos básicos
                const isValid = () => {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    const documentTypes = ["CC", "NIT", "CE", "TI", "PPN", "SSN", "LIC", "DNI"];

                    if (cellPhone.length > 20) return false;
                    if (email.length > 100 || !emailRegex.test(email)) return false;
                    if (documentValue.length > 20) return false;
                    if (fullName.length > 100) return false;
                    if (!documentTypes.includes(documentType)) return false;

                    return true;
                };

                if (!isValid()) {
                    // Ocultar el formulario
                    paymentForm.style.display = "none";
                    
                    // Ocultar mensajes de éxito y mostrar el mensaje de error
                    if (donePayment) donePayment.style.display = "none";
                    if (errorOnPayment) errorOnPayment.style.display = "block";
                    return;
                }

                // Separar el nombre completo en firstName y lastName
                const nameParts = fullName.split(' ');
                const firstName = nameParts[0] || '';
                const lastName = nameParts.slice(1).join(' ') || '';

                // Formatear teléfono
                const phone = cellPhone.startsWith("+57") ? cellPhone : "+57" + cellPhone;

                // Preparar datos en el formato requerido por /api/orders
                formData = {
                    productRef: "{{wf {\"path\":\"reference\",\"type\":\"PlainText\"} }}", // Referencia del producto desde Webflow
                    qty: 1,
                    provider: "epayco", // Especificar que queremos usar ePayco
                    customer: {
                        firstName: firstName,
                        lastName: lastName,
                        email: email,
                        documentType: documentType,
                        documentNumber: documentValue.replace(/\s+/g, ''),
                        phone: phone,
                        birthDate: "1990-01-01" // Valor por defecto, puedes agregar un campo si lo necesitas
                    }
                };

                console.log("Datos preparados para /api/orders:", formData);

                // Ocultar el formulario y mostrar el contenedor de éxito
                paymentForm.style.display = "none";
                if (donePayment) donePayment.style.display = "block";
                if (errorOnPayment) errorOnPayment.style.display = "none";
            });
        }

        if (payButton) {
            payButton.addEventListener('click', async (event) => {
                event.preventDefault(); // Evita el comportamiento natural del botón

                payButton.textContent = "Espere...";
                payButton.disabled = true;

                if (Object.keys(formData).length === 0) {
                    alert("Por favor, procesa la compra primero.");
                    payButton.textContent = "HACER PAGO";
                    payButton.disabled = false;
                    return;
                }

                try {
                    // Hacer POST al nuevo endpoint /api/orders
                    const response = await fetch('https://b5023f005f60.ngrok-free.app/api/orders', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(formData),
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(`HTTP error! status: ${response.status} - ${errorData.message || 'Sin mensaje de error'}`);
                    }

                    const data = await response.json();
                    console.log('Respuesta del servidor /api/orders:', data);
                    console.log('Estructura completa de data:', JSON.stringify(data, null, 2));

                    // Verificar que tenemos los datos de ePayco en la respuesta
                    if (data.success && data.data) {
                        console.log('data.data existe:', !!data.data);
                        console.log('data.data.epayco existe:', !!data.data.epayco);
                        console.log('Contenido de data.data:', data.data);
                        
                        if (data.data.epayco) {
                            const epaycoData = data.data.epayco;
                            
                            console.log('Configurando ePayco checkout:', {
                                publicKey: epaycoData.publicKey.substring(0, 10) + '...',
                                test: epaycoData.test,
                                invoice: epaycoData.checkoutData.invoice
                            });

                            // Configurar ePayco con los datos recibidos
                            const handler = ePayco.checkout.configure({
                                key: epaycoData.publicKey,
                                test: epaycoData.test
                            });

                            // Abrir el checkout de ePayco
                            handler.open(epaycoData.checkoutData);

                            console.log('Checkout de ePayco abierto exitosamente');
                        } else {
                            console.error('data.data.epayco no existe. Contenido de data.data:', data.data);
                            throw new Error("Datos de ePayco no encontrados en la respuesta del servidor.");
                        }
                    } else {
                        console.error('Respuesta inválida:', data);
                        throw new Error("Respuesta inválida del servidor.");
                    }

                } catch (error) {
                    console.error('Error al crear la orden y procesar el pago:', error);
                    
                    // Mostrar mensaje de error
                    if (donePayment) donePayment.style.display = "none";
                    if (errorOnPayment) errorOnPayment.style.display = "block";
                    
                    alert("Hubo un error al procesar el pago. Por favor, intenta nuevamente.");
                    
                    // Restaurar botón
                    payButton.textContent = "HACER PAGO";
                    payButton.disabled = false;
                }
            });
        }

        // Función para manejar la respuesta de ePayco (cuando el usuario completa el pago)
        function handleEpaycoResponse(response) {
            console.log('Respuesta de ePayco:', response);
            
            if (response.success || response.x_cod_transaction_state === '1') {
                // Pago exitoso
                console.log('¡Pago exitoso!');
                alert('¡Pago exitoso! Recibirás un email de confirmación.');
                
                // Opcional: Redirigir a página de éxito
                // window.location.href = 'https://innovatelearning.com.co/tienda/pago-finalizado';
                
            } else if (response.x_cod_transaction_state === '3') {
                // Pago pendiente
                console.log('Pago pendiente');
                alert('Tu pago está siendo procesado. Recibirás una confirmación por email.');
                
            } else {
                // Pago fallido
                console.log('Pago fallido:', response);
                alert('El pago no pudo ser procesado. Por favor, intenta nuevamente.');
            }

            // Restaurar botón para permitir un nuevo intento si es necesario
            payButton.textContent = "HACER PAGO";
            payButton.disabled = false;
        }

        // Escuchar eventos de ePayco
        window.addEventListener('load', function() {
            if (window.ePayco) {
                // Manejar respuesta cuando se cierra el checkout
                window.ePayco.onload = function(response) {
                    handleEpaycoResponse(response);
                };

                // Manejar cuando se cierra el modal sin completar
                window.ePayco.onclose = function() {
                    console.log('Checkout de ePayco cerrado por el usuario');
                    payButton.textContent = "HACER PAGO";
                    payButton.disabled = false;
                };
            }
        });
    });
});
</script>
