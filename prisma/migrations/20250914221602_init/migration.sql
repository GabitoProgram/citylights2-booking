-- CreateEnum
CREATE TYPE "public"."PagoStatus" AS ENUM ('PENDING', 'CANCELLED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "public"."Verificacion" AS ENUM ('PENDING', 'CANCELLED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "public"."EstadoReserva" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "public"."AreaComun" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "capacidad" INTEGER NOT NULL,
    "costoHora" DOUBLE PRECISION NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AreaComun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Reserva" (
    "id" SERIAL NOT NULL,
    "areaId" INTEGER NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "estado" "public"."EstadoReserva" NOT NULL DEFAULT 'PENDING',
    "costo" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Bloqueo" (
    "id" SERIAL NOT NULL,
    "areaId" INTEGER NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,

    CONSTRAINT "Bloqueo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Confirmacion" (
    "id" SERIAL NOT NULL,
    "reservaId" INTEGER NOT NULL,
    "codigoQr" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificada" "public"."Verificacion" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "Confirmacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PagoReserva" (
    "id" SERIAL NOT NULL,
    "reservaId" INTEGER NOT NULL,
    "pagoId" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "estado" "public"."PagoStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "PagoReserva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Confirmacion_reservaId_key" ON "public"."Confirmacion"("reservaId");

-- AddForeignKey
ALTER TABLE "public"."Reserva" ADD CONSTRAINT "Reserva_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "public"."AreaComun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Bloqueo" ADD CONSTRAINT "Bloqueo_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "public"."AreaComun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Confirmacion" ADD CONSTRAINT "Confirmacion_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "public"."Reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PagoReserva" ADD CONSTRAINT "PagoReserva_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "public"."Reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
