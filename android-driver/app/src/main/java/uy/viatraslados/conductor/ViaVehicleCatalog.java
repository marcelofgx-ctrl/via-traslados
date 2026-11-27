package uy.viatraslados.conductor;

import java.util.Arrays;
import java.util.Calendar;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * V33 QA - sugerencias locales del formulario de incorporación.
 * No es una lista cerrada: las opciones "Otro (escribir)" permiten registrar
 * cualquier marca, modelo o color que no figure en el catálogo.
 * La información ingresada se envía al backend igual que antes.
 */
final class ViaVehicleCatalog {
    static final String OTHER = "Otro (escribir)";
    private static final Map<String, String[]> MODELS = new LinkedHashMap<>();

    static {
        MODELS.put("BYD", new String[]{"Dolphin Mini", "Dolphin", "Yuan Pro",
            "Yuan Plus", "Sealion 7", "Seal", "Song Plus", "Seagull"});
        MODELS.put("Geely", new String[]{"EX5", "EX5 Max", "Geometry C",
            "Coolray", "GX3 Pro", "Emgrand", "Okavango"});
        MODELS.put("Chevrolet", new String[]{"Onix", "Onix Plus", "Joy",
            "Tracker", "Spin", "Cruze", "Sail"});
        MODELS.put("Fiat", new String[]{"Mobi", "Argo", "Cronos",
            "Pulse", "Fastback", "Strada"});
        MODELS.put("Volkswagen", new String[]{"Polo", "Virtus", "Nivus",
            "T-Cross", "Taos", "Gol", "Voyage", "Up!"});
        MODELS.put("Renault", new String[]{"Kwid", "Kardian", "Sandero",
            "Logan", "Duster", "Captur", "Oroch"});
        MODELS.put("Hyundai", new String[]{"HB20", "HB20S", "Creta",
            "Tucson", "Kona", "Kona Electric", "Ioniq 5"});
        MODELS.put("Toyota", new String[]{"Yaris", "Corolla", "Corolla Cross",
            "Prius", "RAV4", "Etios"});
        MODELS.put("Suzuki", new String[]{"Swift", "Celerio", "Dzire",
            "Alto", "Baleno", "Vitara", "S-Presso"});
        MODELS.put("Nissan", new String[]{"Versa", "Sentra", "Kicks",
            "March", "Leaf", "Qashqai"});
        MODELS.put("Kia", new String[]{"Picanto", "Soluto", "Rio",
            "Seltos", "Sportage", "Niro", "EV5"});
        MODELS.put("Peugeot", new String[]{"208", "2008", "301",
            "308", "3008", "Partner"});
        MODELS.put("Citroën", new String[]{"C3", "C3 Aircross", "C4 Cactus",
            "C4", "Berlingo"});
        MODELS.put("Chery", new String[]{"Tiggo 2", "Tiggo 4", "Tiggo 7",
            "Tiggo 8", "eQ7"});
        MODELS.put("GAC", new String[]{"Aion Y", "Aion V", "Aion UT",
            "Aion ES", "GS3"});
        MODELS.put("MG", new String[]{"MG4", "MG5", "ZS", "ZS EV", "HS"});
        MODELS.put("JAC", new String[]{"E10X", "e-JS1", "JS2", "JS4", "JS6"});
        MODELS.put("Changan", new String[]{"CS35 Plus", "CS55 Plus",
            "Deepal S05", "Deepal S07"});
        MODELS.put("Ford", new String[]{"EcoSport", "Territory", "Focus",
            "Fiesta", "Escape"});
        MODELS.put("Jeep", new String[]{"Renegade", "Compass",
            "Commander", "Avenger"});
        MODELS.put("Honda", new String[]{"Fit", "City", "Civic", "HR-V", "CR-V"});
        MODELS.put("Mitsubishi", new String[]{"ASX", "Outlander",
            "Eclipse Cross"});
        MODELS.put("Mercedes-Benz", new String[]{"Clase A", "Clase C",
            "Clase E", "GLA", "GLB", "EQB", "Vito"});
        MODELS.put("BMW", new String[]{"Serie 1", "Serie 3", "X1",
            "X3", "iX1", "i4"});
        MODELS.put("Audi", new String[]{"A1", "A3", "A4", "Q2", "Q3", "Q5"});
        MODELS.put("Tesla", new String[]{"Model 3", "Model Y",
            "Model S", "Model X"});
        MODELS.put("Volvo", new String[]{"EX30", "XC40", "XC60",
            "EX40", "EX90"});
        MODELS.put("GWM", new String[]{"Ora 03", "Haval H6", "Haval Jolion"});
        MODELS.put("Jetour", new String[]{"X70", "X70 Plus", "Dashing"});
        MODELS.put("DFSK", new String[]{"Seres 3", "Glory 500",
            "Glory 580"});
        MODELS.put("Dongfeng", new String[]{"Nammi", "Shine", "Box"});
        MODELS.put("Leapmotor", new String[]{"T03", "C10", "B10"});
    }

    private static void add(String brand,String models){
        java.util.TreeSet<String> values=new java.util.TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        if(MODELS.containsKey(brand))values.addAll(Arrays.asList(MODELS.get(brand)));
        values.addAll(Arrays.asList(models.split("\\|")));
        MODELS.put(brand,values.toArray(new String[0]));
    }
    static {
        add("BYD","F3|S6|e2|e5|D1|Han|Tang|Seal U|Song Pro|Shark|Atto 3|Dolphin Surf");
        add("Geely","GC2|GC6|GC7|LC|Emgrand X7|X7 Sport|Azkarra|Starray|EX2|EX5 Pro");
        add("Chevrolet","Spark|Spark GT|Aveo|Prisma|Cobalt|Classic|Agile|Montana|Captiva|Equinox|Trailblazer|S10|Bolt EV|Bolt EUV|Groove");
        add("Fiat","Uno|Fiorino|Palio|Siena|Grand Siena|Punto|500|500X|500e|Toro|Doblò|Fiorino Qubo|Idea|Weekend|Titano");
        add("Volkswagen","Saveiro|Fox|CrossFox|SpaceFox|Suran|Golf|Golf Variant|Jetta|Vento|Passat|Tiguan|Tiguan Allspace|Amarok|ID.3|ID.4");
        add("Renault","Clio|Fluence|Mégane|Kangoo|Koleos|Alaskan|Zoe|Kwid E-Tech|Megane E-Tech|Scénic E-Tech|Arkana|Symbioz");
        add("Hyundai","i10|Grand i10|i20|i30|Accent|Elantra|Santa Fe|Venue|Staria|Ioniq|Ioniq 6|Inster");
        add("Toyota","Aygo|Agya|Aqua|Yaris Cross|Corolla Hybrid|Camry|C-HR|Hilux|SW4|Fortuner|Land Cruiser Prado|Hiace|bZ4X|Raize|Rush");
        add("Suzuki","Grand Vitara|S-Cross|Ignis|Jimny|Ciaz|Ertiga|Fronx|XL7|APV|e Vitara");
        add("Nissan","Note|Tiida|X-Trail|Juke|Frontier|NP300|Murano|Ariya|Magnite");
        add("Kia","Cerato|K3|K4|Soul|Carens|Carnival|Sorento|Stonic|EV3|EV6|EV9");
        add("Peugeot","207 Compact|408|508|5008|Rifter|Expert|e-208|e-2008|Landtrek");
        add("Citroën","C3 Picasso|C4 Lounge|C4 Picasso|Grand C4 Picasso|C4 SpaceTourer|C4 X|C5 Aircross|Jumpy|ë-C3");
        add("Chery","QQ|Fulwin|Arrizo 5|Arrizo 6|Tiggo 3|Tiggo 5|Tiggo 4 Pro|Tiggo 7 Pro|Tiggo 8 Pro|eQ1");
        add("GAC","Emzoom|GS4|GS8|Aion S|Aion LX|Aion Hyptec HT");
        add("MG","MG3|MG GT|MG6|RX5|Marvel R|Cyberster|S5 EV");
        add("JAC","J2|J3|J4|S2|S3|S5|S7|T6|T8|T9|E-JS4|E-JS1");
        add("Changan","Benni|Alsvin|CS15|CS35|CS55|CS75|UNI-T|UNI-K|Hunter|Lumin|Deepal L07");
        add("Ford","Ka|Ka Sedan|Fusion|Mondeo|Ranger|Kuga|Bronco Sport|Maverick|Edge|Mustang Mach-E");
        add("Jeep","Cherokee|Grand Cherokee|Wrangler");
        add("Honda","WR-V|ZR-V|Accord|BR-V");
        add("Mitsubishi","Mirage|Lancer|L200|Montero Sport|Xpander");
        add("Mercedes-Benz","Clase B|CLA|CLS|GLC|GLE|GLS|EQA|EQC|EQE|EQS|Clase V|Sprinter");
        add("BMW","Serie 2|Serie 4|Serie 5|Serie 7|X2|X4|X5|X6|i3|iX|i5|iX3|iX2");
        add("Audi","A5|A6|A7|A8|Q7|Q8|e-tron|Q4 e-tron|Q6 e-tron|Q8 e-tron");
        add("Volvo","V40|V60|V90|S60|S90|XC90|C40");
        add("GWM","Haval H2|Haval H4|Haval H9|Poer|Wingle 5|Wingle 7|Tank 300|Tank 500|Ora 07");
        add("Jetour","X90|X95|T2|T1|X50");
        add("DFSK","Glory 560|Glory ix5|Seres 5|Fengon 500");
        add("Dongfeng","Fengon|Forthing T5 Evo|Forthing Friday|Aeolus Yixuan|Rich 6");
        add("Leapmotor","C11|C16");
        add("SEAT","Ibiza|León|Arona|Ateca|Tarraco");
        add("Škoda","Fabia|Rapid|Octavia|Superb|Scala|Kamiq|Karoq|Kodiaq|Enyaq");
        add("Mazda","Mazda2|Mazda3|Mazda6|CX-3|CX-30|CX-5|CX-50|CX-60|CX-9");
        add("Subaru","Impreza|XV|Crosstrek|Forester|Outback|Legacy|Solterra");
        add("SsangYong","Tivoli|XLV|Korando|Rexton|Actyon Sports|Musso");
        add("KGM","Torres|Tivoli|Korando|Rexton|Musso");
        add("JMC","JMEV EV3|JMEV 3|JMEV GSE|Vigus|Grand Avenue");
        add("Foton","Tunland|Tunland G7|View");
        add("FAW","V2|V5|X40|Bestune T77|Bestune T99|NAT");
        add("BAIC","X25|X35|X55|X65|EU5|BJ40|BJ30|U5 Plus");
        add("Lifan","320|X50|X60|MyWay|Foison");
        add("Great Wall","M4|M2|C30|Haval H5|Wingle 5");
        add("Haval","H2|H6|Jolion|H9");
        add("Maxus","T60|T70|T90 EV|D90|G10|Mifa 9|eDeliver 3");
        add("Lexus","CT|IS|ES|UX|NX|RX|RZ");
        add("MINI","Cooper|Cooper S|Countryman|Clubman|Aceman|Cooper SE");
        add("Land Rover","Discovery Sport|Discovery|Defender|Range Rover Evoque|Range Rover Velar|Range Rover Sport");
        add("Porsche","Macan|Cayenne|Panamera|Taycan");
        add("RAM","700|1000|1500|Rampage");
        add("Dodge","Journey|Durango");
        add("Cupra","Formentor|Born|Terramar|Tavascan");
        add("Omoda","C5|E5|C7");
        add("Jaecoo","J7|J8|J5");
        add("Zeekr","X|001|007|7X");
        add("Neta","V|Aya|X|S");
        add("Seres","3|5|7");
        add("Forthing","T5 Evo|Friday|U-Tour");
        add("Hongqi","E-HS9|E-QM5|HS5|H5");
        add("XPeng","G6|G9|P7");
        add("Lynk & Co","01|02|08");
        add("Jinbei","Haise|H2");
        add("SWM","G01|G01F|G05");
        add("Kaiyi","X3|X3 Pro|X7");
        add("Soueast","S06|S07|S09");
        add("Changan Deepal","S05|S07|L07");
        add("Chery Exeed","LX|TXL|VX");
        add("Denza","D9|N7|Z9 GT");
    }
    static int modelCount(){int n=0;for(String[] values:MODELS.values())n+=values.length;return n;}
    private ViaVehicleCatalog() {}

    static String[] brands() {
        String[] values = MODELS.keySet().toArray(new String[0]);
        Arrays.sort(values,String.CASE_INSENSITIVE_ORDER);
        return appendOther(values);
    }

    static String[] modelsFor(String brand) {
        if (brand != null) {
            for (Map.Entry<String, String[]> entry : MODELS.entrySet()) {
                if (entry.getKey().equalsIgnoreCase(brand.trim())) {
                    return appendOther(entry.getValue());
                }
            }
        }
        return new String[]{OTHER};
    }

    static String[] colors() {
        return new String[]{"Blanco", "Negro", "Gris", "Plata", "Azul", "Rojo",
            "Verde", "Beige", "Marrón", "Dorado", "Bordó", "Amarillo",
            "Naranja", "Celeste", "Violeta", "Champagne", "Gris oscuro", "Gris claro", "Blanco perlado", "Azul oscuro", "Bicolor", OTHER};
    }

    static String[] years() {
        int latest = Calendar.getInstance().get(Calendar.YEAR) + 2;
        String[] values = new String[latest - 1990 + 1];
        for (int i = 0; i < values.length; i++) {
            values[i] = String.valueOf(latest - i);
        }
        return values;
    }

    private static String[] appendOther(String[] source) {
        String[] copy = Arrays.copyOf(source, source.length + 1);
        copy[source.length] = OTHER;
        return copy;
    }
}
