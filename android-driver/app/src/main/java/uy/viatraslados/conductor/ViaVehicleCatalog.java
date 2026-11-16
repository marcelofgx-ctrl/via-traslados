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

    private ViaVehicleCatalog() {}

    static String[] brands() {
        String[] values = MODELS.keySet().toArray(new String[0]);
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
            "Naranja", "Celeste", "Violeta", OTHER};
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
