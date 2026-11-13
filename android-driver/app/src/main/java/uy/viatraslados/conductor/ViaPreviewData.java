package uy.viatraslados.conductor;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Datos ficticios para probar la interfaz V27 en un paquete Android separado.
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


    private static final java.util.Map<String,String> statuses=new java.util.HashMap<>();
    private static final java.util.Map<String,Integer> prices=new java.util.HashMap<>();
    private static final java.util.Set<String> releasedDemo=new java.util.HashSet<>();
    private static final java.util.Map<String,String> assignedDemo=new java.util.HashMap<>();
    private static final java.util.Map<String,JSONObject> commercialDemo=new java.util.HashMap<>();
    private static final java.util.Map<String,Integer> priceConfig=new java.util.HashMap<>();
    private static boolean commissionExamplePaid=false;
    static {
        priceConfig.put("baseUyu",300);priceConfig.put("perKmUyu",25);
        priceConfig.put("perMinuteUyu",4);priceConfig.put("minTargetUyu",850);
        priceConfig.put("minFloorUyu",650);priceConfig.put("lowFactorBps",7500);
        priceConfig.put("highFactorBps",15500);
    }

    private static int round10(double amount){return (int)(Math.round(amount/10.0)*10);}
    private static String getBusinessId(String path){
        String prefix="/api/admin/drivers/";
        if(path.startsWith(prefix))
            return path.substring(prefix.length()).split("/")[0];
        return "";
    }
    private static JSONObject demoGuide(JSONObject booking){
        JSONObject doc=new JSONObject();
        try{
            JSONObject route=booking.optJSONObject("route");
            if(route==null)return doc;
            double kms=route.optDouble("distanceKm",0);
            double mins=route.optDouble("durationMinutes",0);
            int basic=round10(Math.max(priceConfig.get("minTargetUyu"),
                priceConfig.get("baseUyu")+kms*priceConfig.get("perKmUyu")+
                mins*priceConfig.get("perMinuteUyu")));
            int low=round10(Math.max(priceConfig.get("minFloorUyu"),
                basic*priceConfig.get("lowFactorBps")/10000.0));
            int high=round10(Math.max(basic,
                basic*priceConfig.get("highFactorBps")/10000.0));
            doc.put("currency","UYU").put("minimum",low)
                .put("suggested",basic).put("maximum",high);
        }catch(Exception ignored){}
        return doc;
    }
    private static JSONObject commercialDriver(JSONObject driver) {
        String id=driver.optString("id","");
        JSONObject remembered=commercialDemo.get(id);
        JSONObject result=new JSONObject();
        try{
            result.put("id",id).put("name",driver.optString("name"))
                .put("status",driver.optString("status","approved"))
                .put("mode",remembered==null?"contractor":remembered.optString("mode","contractor"))
                .put("canQuoteAll",remembered!=null&&remembered.optBoolean("canQuoteAll"))
                .put("canRelease",remembered!=null&&remembered.optBoolean("canRelease"))
                .put("commissionBps",remembered==null?2500:remembered.optInt("commissionBps",2500));
        }catch(Exception ignored){}
        return result;
    }


    private static JSONObject sample(String id,String date,String time,String from,
            String to,int pax,int luggage,double km,int minutes,String state,int price,
            long createdAt){
        JSONObject item=booking();
        try {
            item.put("id",id).put("date",date).put("time",time);
            item.put("origin",from).put("destination",to);
            item.put("name","Pasajero de demostración");
            item.put("passengers",pax).put("bags",luggage);
            item.put("status",statuses.containsKey(id)?statuses.get(id):state);
            item.put("price",prices.containsKey(id)?prices.get(id):price);
            item.put("created_at",createdAt);
            item.put("assignedDriverId",assignedDemo.containsKey(id)?
                "11111111-1111-4111-8111-111111111111":JSONObject.NULL);
            item.put("assignedDriverName",assignedDemo.containsKey(id)?
                assignedDemo.get(id):JSONObject.NULL);
            item.put("canQuote","requested".equals(item.optString("status")));
            item.put("canRelease","requested".equals(item.optString("status"))&&
                !releasedDemo.contains(id));
            item.put("released",releasedDemo.contains(id));
            item.put("notes","Datos inventados para probar la pantalla, sin reservas reales.");
            item.put("route",new JSONObject().put("distanceKm",km)
                .put("durationMinutes",minutes).put("source","simulated"));
        }catch(Exception ignored){}
        return item;
    }

    public static JSONArray requests(){
        JSONArray rows=new JSONArray();
        rows.put(sample("VIA-DEMO-N001","2026-11-20","10:00",
            "Ruta 200, San José de Carrasco, Canelones",
            "Aeropuerto Internacional de Carrasco, Canelones",
            1,1,5.1,8,"requested",0,1794501200L));
        rows.put(sample("VIA-DEMO-N002","2026-11-21","14:30",
            "Av. Italia 4230, Montevideo",
            "Bulevar Artigas 1825, Montevideo",
            2,2,12.7,26,"requested",0,1794498500L));
        rows.put(sample("VIA-DEMO-N003","2026-11-24","09:15",
            "Alberto Méndez 107, Colonia del Sacramento",
            "Lagunillas 434, Montevideo",
            1,1,185,146,"requested",0,1794499000L));
        rows.put(sample("VIA-DEMO-Q001","2026-11-23","07:30",
            "Aeropuerto Internacional de Carrasco",
            "Punta Carretas, Montevideo",
            3,2,23.4,38,"quoted",3150,1794498000L));
        rows.put(sample("VIA-DEMO-Q002","2026-11-25","18:00",
            "Ciudad Vieja, Montevideo",
            "Shangrilá, Canelones",
            1,0,26.1,42,"quoted",2400,1794488000L));
        rows.put(booking());
        return rows;
    }

    private static String bookingId(String path){
        String prefix="/api/operator/requests/";
        if(path.startsWith(prefix))return path.substring(prefix.length()).split("/")[0];
        prefix="/api/admin/requests/";
        if(path.startsWith(prefix))return path.substring(prefix.length()).split("/")[0];
        return ID;
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
            return new Reply(200,requests());
        if("GET".equals(method)&&"/api/admin/drivers".equals(path))
            return new Reply(200,wrap("drivers",drivers()));
        if(BuildConfig.VIA_BUSINESS_PREVIEW&&"GET".equals(method)
            &&path.endsWith("/price-guide")){
            String id=bookingId(path);
            JSONArray rows=requests();
            for(int i=0;i<rows.length();i++){
                JSONObject b=rows.optJSONObject(i);
                if(b!=null&&id.equals(b.optString("id"))){
                    JSONObject response=new JSONObject();
                    try{
                        JSONObject guide=demoGuide(b);
                        int target=guide.optInt("suggested",850);
                        response.put("guide",guide).put("canQuote",
                            "requested".equals(b.optString("status")))
                            .put("canRelease",b.optBoolean("canRelease"))
                            .put("exampleAtSuggested",new JSONObject()
                                .put("grossUyu",target).put("commissionBps",0)
                                .put("commissionUyu",0).put("driverNetUyu",target));
                    }catch(Exception ignored){}
                    return new Reply(200,response);
                }
            }
            return fail(404,"Viaje ficticio no encontrado");
        }
        if(BuildConfig.VIA_BUSINESS_PREVIEW&&"POST".equals(method)
            &&path.endsWith("/release")){
            releasedDemo.add(bookingId(path));
            JSONObject response=new JSONObject();
            try{response.put("released",true);}catch(Exception ignored){}
            return new Reply(200,response);
        }
        if(BuildConfig.VIA_BUSINESS_PREVIEW&&"GET".equals(method)
            &&"/api/admin/commercial-drivers".equals(path)){
            JSONArray all=drivers();
            JSONArray list=new JSONArray();
            for(int i=0;i<all.length();i++)
                list.put(commercialDriver(all.optJSONObject(i)));
            return new Reply(200,wrap("drivers",list));
        }
        if(BuildConfig.VIA_BUSINESS_PREVIEW&&"PATCH".equals(method)
            &&path.endsWith("/commercial")){
            commercialDemo.put(getBusinessId(path),payload);
            JSONObject response=new JSONObject();
            try{response.put("updated",true);}catch(Exception ignored){}
            return new Reply(200,response);
        }
        if(BuildConfig.VIA_BUSINESS_PREVIEW
            &&"GET".equals(method)&&"/api/admin/commissions".equals(path)){
            JSONArray list=new JSONArray();
            JSONObject example=new JSONObject();
            try{
                example.put("bookingId","VIA-COMISION-DEMO").put("driverId",DRIVER_2)
                    .put("driverName","Carlos Pereira")
                    .put("grossUyu",5500).put("rateBps",2500)
                    .put("commissionUyu",1375.0)
                    .put("paymentStatus",commissionExamplePaid?"paid":"pending")
                    .put("reference",commissionExamplePaid?"TRANSFERENCIA-DEMO":"");
                list.put(example);
            }catch(Exception ignored){}
            return new Reply(200,wrap("items",list));
        }
        if(BuildConfig.VIA_BUSINESS_PREVIEW&&"PATCH".equals(method)
            &&path.startsWith("/api/admin/commissions/")){
            commissionExamplePaid=true;
            JSONObject response=new JSONObject();
            try{response.put("status","paid");}catch(Exception ignored){}
            return new Reply(200,response);
        }
        if(BuildConfig.VIA_BUSINESS_PREVIEW&&"/api/admin/pricing".equals(path)){
            if("PATCH".equals(method)){
                if(payload==null)return fail(400,"Faltan los parámetros");
                for(String key:new String[]{"baseUyu","perKmUyu","perMinuteUyu",
                    "minTargetUyu","minFloorUyu","lowFactorBps","highFactorBps"})
                    priceConfig.put(key,payload.optInt(key,priceConfig.get(key)));
            }
            JSONObject config=new JSONObject();
            for(java.util.Map.Entry<String,Integer> entry:priceConfig.entrySet()){
                try{config.put(entry.getKey(),entry.getValue());}catch(Exception ignored){}
            }
            return new Reply(200,wrap("config",config));
        }

        if(BuildConfig.VIA_BUSINESS_PREVIEW&&"GET".equals(method)
            &&"/api/admin/team".equals(path)){
            JSONObject response=wrap("admins",new JSONArray());
            try{response.put("canManageRoles",true);}catch(Exception ignored){}
            return new Reply(200,response);
        }
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
            String id=bookingId(path);
            if(BuildConfig.VIA_BUSINESS_PREVIEW && payload!=null
                &&"quoted".equals(payload.optString("status"))){
                if(assignedDemo.containsKey(id)||"quoted".equals(statuses.get(id)))
                    return fail(409,"La oferta fue tomada por otro conductor.");
                assignedDemo.put(id,"Administrador de demostración");
            }
            if(payload!=null){
                String next=payload.optString("status","");
                if(!next.isEmpty()){
                    if(ID.equals(id))status=next;
                    else statuses.put(id,next);
                }
                if(payload.has("price")){
                    if(ID.equals(id))price=payload.optInt("price",price);
                    else prices.put(id,payload.optInt("price",0));
                }
            }
            JSONArray all=requests();
            for(int i=0;i<all.length();i++){
                JSONObject row=all.optJSONObject(i);
                if(row!=null&&id.equals(row.optString("id")))return new Reply(200,row);
            }
            return fail(404,"Solicitud ficticia no encontrada");
        }
        return fail(400,"Modo demostración: operación sin servidor.");
    }

    private static JSONObject wrap(String key,JSONObject value){
        JSONObject result=new JSONObject();
        try{result.put(key,value);}catch(Exception ignored){}
        return result;
    }

    private static JSONObject wrap(String key,JSONArray value){
        JSONObject result=new JSONObject();
        try{result.put(key,value);}catch(Exception ignored){}
        return result;
    }
}
