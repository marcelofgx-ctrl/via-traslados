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
    private static final java.util.Map<String,String> demoStatuses=new java.util.HashMap<>();
    private static final java.util.Map<String,Integer> demoPrices=new java.util.HashMap<>();

    private static JSONObject listBooking(String id,String date,String time,
        String from,String to,int pax,int bags,String initialStatus,
        int initialPrice,double km,int minutes,int hoursAgo) {
        JSONObject b=new JSONObject();
        try {
            String current=demoStatuses.containsKey(id)?demoStatuses.get(id):initialStatus;
            b.put("id",id).put("name","Pasajero de prueba").put("phone","099000000")
                .put("email","demo@ejemplo.invalid")
                .put("date",date).put("time",time).put("origin",from)
                .put("destination",to).put("passengers",pax).put("bags",bags)
                .put("status",current)
                .put("price",demoPrices.containsKey(id)?demoPrices.get(id):initialPrice)
                .put("created_at",System.currentTimeMillis()/1000L-3600L*hoursAgo)
                .put("notes","Viaje ficticio de demostración visual V27")
                .put("assignedDriverId",JSONObject.NULL)
                .put("assignedDriverName",JSONObject.NULL)
                .put("route",new JSONObject().put("distanceKm",km)
                    .put("durationMinutes",minutes)
                    .put("source","Geoapify").put("estimate",true)
                    .put("trafficIncluded",false));
        } catch(Exception ignored){}
        return b;
    }

    public static JSONArray listDemoBookings(){
        return new JSONArray()
            .put(listBooking("VIA-V27-NEW-01","2026-11-15","11:00",
                "Alberto Méndez 107, Colonia del Sacramento, Colonia, Uruguay",
                "Lagunillas 434, Montevideo, Uruguay",1,1,"requested",0,185,146,4))
            .put(listBooking("VIA-V27-NEW-02","2026-11-16","12:55",
                "Aeropuerto Internacional de Carrasco, Ciudad de la Costa, Canelones",
                "Punta del Este, Maldonado, Uruguay",2,2,"requested",0,114,100,8))
            .put(listBooking("VIA-V27-QUOTE-03","2026-11-20","10:00",
                "Ruta 200 - General Líber Seregni 262, San José de Carrasco, Canelones",
                "Aeropuerto Internacional de Carrasco, Colonia Nicolich, Canelones",
                1,1,"quoted",2750,5.1,8,27))
            .put(booking());
    }



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
            return new Reply(200,BuildConfig.VIA_LIST_PREVIEW?
                listDemoBookings():new JSONArray().put(booking()));
        if("GET".equals(method)&&"/api/admin/drivers".equals(path))
            return new Reply(200,wrap("drivers",drivers()));
        if("GET".equals(method)&&"/api/admin/settings".equals(path)){
            JSONObject settings=new JSONObject();
            try{settings.put("publicEnabled",true).put("drivers",new JSONArray());}
            catch(Exception ignored){}
            return new Reply(200,settings);
        }
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
            if(BuildConfig.VIA_LIST_PREVIEW&&payload!=null){
                String id=path.substring("/api/operator/requests/".length());
                if(id.startsWith("VIA-V27-")){
                    if(payload.has("status"))demoStatuses.put(id,payload.optString("status"));
                    if(payload.has("price"))demoPrices.put(id,payload.optInt("price",0));
                    return new Reply(200,wrap("preview",listDemoBookings()));
                }
            }
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
