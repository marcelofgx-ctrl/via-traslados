package uy.viatraslados.conductor;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Datos ficticios para probar la interfaz V26 en un paquete Android separado.
 * Nunca invoca el Worker, D1 ni servicios de producción.
 */
public final class ViaPreviewData {
    private static final String ID = "VIA-V26-DEMO";
    private static final String DRIVER_1 = "11111111-1111-4111-8111-111111111111";
    private static final String DRIVER_2 = "22222222-2222-4222-8222-222222222222";
    private static final String DRIVER_3 = "33333333-3333-4333-8333-333333333333";
    private static String assignedId;
    private static String assignedName;
    private static String status = "accepted";
    private static int price = 2750;

    private ViaPreviewData(){}

    public static JSONObject booking(){
        JSONObject b = new JSONObject();
        try {
            b.put("id",ID);
            b.put("name","Pasajero de prueba");
            b.put("phone","099000000");
            b.put("email","pasajero@ejemplo.invalid");
            b.put("date","2026-11-20");
            b.put("time","10:00");
            b.put("origin","RUTA 200 - GENERAL LIBER SEREGNI 262, SAN JOSE DE CARRASCO, CANELONES");
            b.put("destination","Aeropuerto Internacional de Carrasco, Colonia Nicolich, Canelones");
            b.put("passengers",1);
            b.put("bags",1);
            b.put("price",price);
            b.put("status",status);
            b.put("notes","Reserva ficticia utilizada exclusivamente para evaluar el diseño V26.");
            b.put("assignedDriverId",assignedId==null?JSONObject.NULL:assignedId);
            b.put("assignedDriverName",assignedName==null?JSONObject.NULL:assignedName);
            b.put("route",new JSONObject().put("distanceKm",5.1)
                .put("durationMinutes",8).put("source","Geoapify").put("estimate",true)
                .put("trafficIncluded",false));
        }catch(Exception ignored){}
        return b;
    }

    private static JSONObject driver(String id,String name,String phone,
                                      String plate,String make,String model,
                                      int capacity,int luggage,boolean conflict){
        JSONObject d=new JSONObject();
        try {
            d.put("id",id).put("name",name).put("phone",phone)
                .put("email",name.toLowerCase().replace(' ','-')+"@ejemplo.invalid")
                .put("emailVerified",true).put("status","approved");
            d.put("vehicle",new JSONObject()
                .put("plate",plate).put("make",make).put("model",model)
                .put("passengerCapacity",capacity).put("luggageCapacity",luggage));
            JSONArray conflicts=new JSONArray();
            if(conflict)conflicts.put(new JSONObject().put("bookingId","VIA-OTRO-DEMO")
                .put("date","2026-11-20").put("time","10:15"));
            d.put("conflicts",conflicts);
            d.put("capacityConflict",capacity<1||luggage<1);
        }catch(Exception ignored){}
        return d;
    }

    public static JSONArray drivers(){
        return new JSONArray()
            .put(driver(DRIVER_1,"Lucía Gómez","099000001","STP1234","Geely","EX5",4,3,false))
            .put(driver(DRIVER_2,"Carlos Pereira","099000002","APP5678","BYD","Yuan Pro",4,2,true))
            .put(driver(DRIVER_3,"Sofía Rodríguez","099000003","ABC1234","Nissan","March",1,0,false));
    }

    public static final class Reply {
        public final int status;
        public final String body;
        Reply(int status,JSONObject value){this.status=status;this.body=value.toString();}
        Reply(int status,JSONArray value){this.status=status;this.body=value.toString();}
    }

    private static Reply fail(int code,String reason){
        try{return new Reply(code,new JSONObject().put("error",reason));}
        catch(Exception ignored){return new Reply(400,new JSONObject());}
    }

    public static synchronized Reply request(String method,String path,JSONObject payload){
        if("GET".equals(method)&&"/api/operator/requests".equals(path))
            return new Reply(200,new JSONArray().put(booking()));
        if("GET".equals(method)&&"/api/admin/drivers".equals(path))
            return new Reply(200,wrap("drivers",drivers()));
        if("GET".equals(method)&&"/api/admin/settings".equals(path))
            return new Reply(200,new JSONObject().put("publicEnabled",true)
                .put("drivers",new JSONArray()));
        if("GET".equals(method)&&path.endsWith("/assignment-options")){
            JSONObject current=booking(),response=new JSONObject();
            try {
                response.put("bookingId",ID).put("bookingStatus",status).put("assignable",true)
                    .put("assignedDriverId",assignedId==null?JSONObject.NULL:assignedId)
                    .put("assignedDriverName",assignedName==null?JSONObject.NULL:assignedName)
                    .put("availabilitySource","schedule-only").put("gpsAvailable",false)
                    .put("drivers",drivers());
            }catch(Exception ignored){}
            return new Reply(200,response);
        }
        if("POST".equals(method)&&path.endsWith("/assign")){
            if(payload==null)return fail(400,"Faltan los datos");
            String next=payload.optString("driverId","");
            if(payload.isNull("driverId"))next=null;
            String expected=payload.optString("expectedDriverId","");
            if(payload.isNull("expectedDriverId"))expected=null;
            if(!java.util.Objects.equals(expected,assignedId))
                return fail(409,"La asignación cambió. Actualizá la pantalla.");
            if(DRIVER_2.equals(next))return fail(409,"Hay un cruce de agenda.");
            if(DRIVER_3.equals(next))return fail(409,"Capacidad insuficiente.");
            if(next!=null&&!DRIVER_1.equals(next))return fail(409,"Conductor inválido.");
            assignedId=next;
            assignedName=next==null?null:"Lucía Gómez";
            JSONObject result=new JSONObject();
            try{result.put("bookingId",ID).put("driverId",next==null?JSONObject.NULL:next);}
            catch(Exception ignored){}
            return new Reply(200,result);
        }
        if("PATCH".equals(method)&&path.contains("/api/operator/requests/")){
            if(payload!=null){
                String next=payload.optString("status","");
                if(!next.isEmpty())status=next;
                if(payload.has("price"))price=payload.optInt("price",price);
            }
            return new Reply(200,booking());
        }
        return fail(400,"Modo demostración: operación sin servidor.");
    }

    private static JSONObject wrap(String key,JSONArray value){
        JSONObject result=new JSONObject();
        try{result.put(key,value);}catch(Exception ignored){}
        return result;
    }
}
